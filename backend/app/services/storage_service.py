"""Stockage des exports (M2-T15) — bucket GCS PRIVÉ, ADR-EXPORT-DELIVERY.

R2 tranché : le téléchargement est PROXIFIÉ par le backend — aucune URL
signée, le bucket ne sert jamais rien directement. Ce module n'expose que
upload/download/delete d'octets ; la route de téléchargement (ownership à
chaque accès) est M2-T17, l'écriture par le worker M2-T16.

- Client google-cloud-storage SYNCHRONE (mémoïsé) → chaque appel passe par le
  threadpool (même convention qu'iam_auth).
- ``STORAGE_EMULATOR_HOST`` (standard du client GCS) route vers
  fake-gcs-server en test : client anonyme, aucun credential requis. INTERDIT
  hors `environment=development` (revue T15 : une variable posée par erreur en
  prod redirigerait les PDF vers un hôte arbitraire).
- Bucket non configuré (``settings.export_bucket_name`` vide) ⇒ erreur TYPÉE
  immédiate, jamais d'appel réseau. `_bucket_name()` est rappelé dans la
  fonction async (échec avant le threadpool) PUIS dans la fonction sync.
"""

import logging
import os
from functools import lru_cache

from google.api_core import exceptions as gcs_exceptions
from google.auth.credentials import AnonymousCredentials
from google.cloud import storage
from starlette.concurrency import run_in_threadpool

from app.config import settings

logger = logging.getLogger(__name__)

# Timeout explicite sur chaque appel GCS (revue T15) : la chaîne de timeouts
# reste lisible, un hôte qui pend ne bloque pas un worker indéfiniment.
_GCS_TIMEOUT = 60.0
# Plafond d'un export stocké (aligné sur export_client) — ceinture avant upload.
_MAX_EXPORT_BYTES = 20 * 1024 * 1024


class StorageNotConfiguredError(Exception):
    """`export_bucket_name` vide : stockage désactivé (dev sans émulateur)."""


class ExportFileMissingError(Exception):
    """Objet absent du bucket : fichier jamais écrit ou PURGÉ par la rétention
    (lifecycle GCS, T19) — la voie de renouvellement est de relancer l'export.
    Le nom d'objet (user_id/cv_id) est porté par l'attribut `object_name`,
    JAMAIS par le message : la route T17 ne doit pas le refléter (revue T15)."""

    def __init__(self, object_name: str) -> None:
        super().__init__("fichier d'export introuvable")
        self.object_name = object_name


@lru_cache(maxsize=1)
def _client() -> storage.Client:
    """Client GCS mémoïsé (revue T15 : évite une re-découverte ADC et une
    nouvelle session par appel). Anonyme contre l'émulateur, ADC sinon (WIF).
    L'émulateur est REFUSÉ hors development : une fuite de config ne doit pas
    rediriger les données de CV vers un hôte arbitraire. Tests : cache_clear()."""
    if os.getenv("STORAGE_EMULATOR_HOST"):
        if settings.environment.lower() != "development":
            raise RuntimeError(
                "STORAGE_EMULATOR_HOST défini hors development — refus "
                "(redirigerait les exports vers un hôte non-GCP)"
            )
        return storage.Client(
            credentials=AnonymousCredentials(), project="emulateur-local"
        )
    return storage.Client()


def _bucket_name() -> str:
    name = settings.export_bucket_name
    if not name:
        raise StorageNotConfiguredError(
            "export_bucket_name vide : stockage des exports non configuré"
        )
    return name


def _upload_sync(object_name: str, data: bytes, content_type: str) -> None:
    blob = _client().bucket(_bucket_name()).blob(object_name)
    blob.upload_from_string(data, content_type=content_type, timeout=_GCS_TIMEOUT)


def _download_sync(object_name: str) -> bytes:
    blob = _client().bucket(_bucket_name()).blob(object_name)
    try:
        return blob.download_as_bytes(timeout=_GCS_TIMEOUT)
    except gcs_exceptions.NotFound as exc:
        raise ExportFileMissingError(object_name) from exc


def _delete_sync(object_name: str) -> None:
    blob = _client().bucket(_bucket_name()).blob(object_name)
    try:
        blob.delete(timeout=_GCS_TIMEOUT)
    except gcs_exceptions.NotFound:
        # Idempotent : supprimer un objet déjà absent n'est pas une erreur.
        pass


def _exists_sync(object_name: str) -> bool:
    return (
        _client().bucket(_bucket_name()).blob(object_name).exists(timeout=_GCS_TIMEOUT)
    )


async def upload_export(object_name: str, data: bytes, content_type: str) -> None:
    """Écrit un fichier d'export dans le bucket privé (écrase l'existant)."""
    _bucket_name()  # échec AVANT le threadpool si non configuré
    if len(data) > _MAX_EXPORT_BYTES:
        # Ceinture (revue T15) : jamais stocker un export anormalement gros.
        raise ValueError("export trop volumineux pour le stockage")
    await run_in_threadpool(_upload_sync, object_name, data, content_type)
    logger.info("export stocké : %s (%d octets)", object_name, len(data))


async def download_export(object_name: str) -> bytes:
    """Lit un fichier d'export. Absent ⇒ ExportFileMissingError (relancer l'export)."""
    _bucket_name()
    return await run_in_threadpool(_download_sync, object_name)


async def delete_export(object_name: str) -> None:
    """Supprime un fichier d'export (idempotent)."""
    _bucket_name()
    await run_in_threadpool(_delete_sync, object_name)


async def export_exists(object_name: str) -> bool:
    """Vrai si l'objet est présent dans le bucket (cache-hit vérifié, M2-T16).

    Un objet purgé par la rétention laisse `cv.gcs_pdf_url` pointer dans le
    vide : sans ce contrôle, le worker resservirait un cache mort et le
    téléchargement échouerait — le re-rendu est alors forcé."""
    _bucket_name()
    return await run_in_threadpool(_exists_sync, object_name)
