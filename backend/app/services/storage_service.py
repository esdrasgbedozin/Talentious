"""Stockage des exports (M2-T15) — bucket GCS PRIVÉ, ADR-EXPORT-DELIVERY.

R2 tranché : le téléchargement est PROXIFIÉ par le backend — aucune URL
signée, le bucket ne sert jamais rien directement. Ce module n'expose que
upload/download/delete d'octets ; la route de téléchargement (ownership à
chaque accès) est M2-T17, l'écriture par le worker M2-T16.

- Client google-cloud-storage SYNCHRONE → chaque appel passe par le
  threadpool (même convention qu'iam_auth).
- ``STORAGE_EMULATOR_HOST`` (standard du client GCS) route vers
  fake-gcs-server en test : client anonyme, aucun credential requis.
- Bucket non configuré (``settings.export_bucket_name`` vide) ⇒ erreur TYPÉE
  immédiate, jamais d'appel réseau.
"""

import logging
import os

from google.api_core import exceptions as gcs_exceptions
from google.auth.credentials import AnonymousCredentials
from google.cloud import storage
from starlette.concurrency import run_in_threadpool

from app.config import settings

logger = logging.getLogger(__name__)


class StorageNotConfiguredError(Exception):
    """`export_bucket_name` vide : stockage désactivé (dev sans émulateur)."""


class ExportFileMissingError(Exception):
    """Objet absent du bucket : fichier jamais écrit ou PURGÉ par la rétention
    (lifecycle GCS, T19) — la voie de renouvellement est de relancer l'export."""


def _client() -> storage.Client:
    """Client GCS — anonyme contre l'émulateur, ADC sinon (WIF sur Cloud Run)."""
    if os.getenv("STORAGE_EMULATOR_HOST"):
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
    blob.upload_from_string(data, content_type=content_type)


def _download_sync(object_name: str) -> bytes:
    blob = _client().bucket(_bucket_name()).blob(object_name)
    try:
        return blob.download_as_bytes()
    except gcs_exceptions.NotFound as exc:
        raise ExportFileMissingError(object_name) from exc


def _delete_sync(object_name: str) -> None:
    blob = _client().bucket(_bucket_name()).blob(object_name)
    try:
        blob.delete()
    except gcs_exceptions.NotFound:
        # Idempotent : supprimer un objet déjà absent n'est pas une erreur.
        pass


def _exists_sync(object_name: str) -> bool:
    return _client().bucket(_bucket_name()).blob(object_name).exists()


async def upload_export(object_name: str, data: bytes, content_type: str) -> None:
    """Écrit un fichier d'export dans le bucket privé (écrase l'existant)."""
    _bucket_name()  # échec AVANT le threadpool si non configuré
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
