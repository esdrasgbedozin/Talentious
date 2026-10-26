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
import re
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

# Garde-fou FAIL-CLOSED de la purge par préfixe (M2-T28, RGPD). Un préfixe de
# purge DOIT cibler l'arborescence d'UN utilisateur : `exports/{user_id}/…`
# (puis éventuellement `{cv_id}/`). Tout préfixe vide, non ancré sur `exports/`
# ou ne portant pas un UUID d'utilisateur effacerait un périmètre trop large
# (au pire, tout le bucket). La purge refuse alors d'agir plutôt que de risquer
# une suppression catastrophique irréversible.
_UUID_RE = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
# `fullmatch` sur la structure COMPLÈTE (revue sécu T28) : exports/{user}/ ou
# exports/{user}/{cv}/ et RIEN d'autre — refuse aussi un sous-chemin arbitraire
# (ex. exports/{u}/../…), défense en profondeur même si GCS ne lit pas `..`.
_PURGE_PREFIX_RE = re.compile(rf"exports/{_UUID_RE}/({_UUID_RE}/)?", re.IGNORECASE)


def export_prefix(user_id, cv_id=None) -> str:
    """Préfixe GCS canonique des exports — SOURCE UNIQUE du chemin (revue T28) :
    l'écriture (worker), la garde de téléchargement et la purge le partagent, pour
    qu'ils ne divergent jamais. `exports/{user_id}/` (tout l'utilisateur) ou
    `exports/{user_id}/{cv_id}/` (un CV)."""
    base = f"exports/{user_id}/"
    return base if cv_id is None else f"{base}{cv_id}/"


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


def _delete_prefix_sync(prefix: str) -> int:
    client = _client()
    bucket = client.bucket(_bucket_name())
    deleted = 0
    failed = 0
    # list_blobs auto-paginé, puis delete : chaque objet sous le préfixe est effacé.
    # Un échec unitaire (5xx/429) NE DOIT PAS stopper la boucle (revue T28) — on
    # continue pour effacer le maximum, puis on lève un bilan à la fin.
    for blob in client.list_blobs(bucket, prefix=prefix, timeout=_GCS_TIMEOUT):
        try:
            blob.delete(timeout=_GCS_TIMEOUT)
            deleted += 1
        except gcs_exceptions.NotFound:
            # Course avec une autre purge / la rétention : déjà parti, idempotent.
            pass
        except Exception:  # noqa: BLE001 — on poursuit la purge, bilan levé après
            failed += 1
    if failed:
        raise RuntimeError(
            f"purge partielle sous {prefix} : {failed} objet(s) non supprimé(s)"
        )
    return deleted


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


async def delete_export_prefix(prefix: str) -> int:
    """Purge RGPD : supprime TOUS les objets d'export sous `prefix` (effacement
    d'un CV ou d'un compte — M2-T28). Idempotent, retourne le nombre supprimé.

    Garde-fou FAIL-CLOSED : le préfixe DOIT matcher EXACTEMENT `exports/{user_id}/`
    ou `exports/{user_id}/{cv_id}/` (sinon il engloberait d'autres utilisateurs par
    correspondance de préfixe littérale, voire tout le bucket). Un préfixe invalide
    lève `ValueError` AVANT tout appel réseau — on refuse d'agir plutôt que
    d'effacer trop. La politique best-effort appartient à
    `safe_delete_export_prefix` (ne pas bloquer un effacement légalement dû pour un
    incident de stockage)."""
    # Garde-fou D'ABORD (revue T28) : un préfixe invalide est un bug d'appelant,
    # détecté même en dev sans bucket — indépendant de la config.
    if not _PURGE_PREFIX_RE.fullmatch(prefix):
        raise ValueError(
            "préfixe de purge invalide : attendu exports/{user_id}/[{cv_id}/]"
        )
    _bucket_name()  # échec AVANT le threadpool si non configuré
    deleted = await run_in_threadpool(_delete_prefix_sync, prefix)
    logger.info("purge RGPD : %d objet(s) supprimé(s) sous %s", deleted, prefix)
    return deleted


async def safe_delete_export_prefix(prefix: str, *, context: str) -> None:
    """Purge RGPD BEST-EFFORT : ne lève JAMAIS (revue T28). Politique unique,
    partagée par `delete_cv` et `delete_account` — un effacement légalement dû ne
    doit pas être bloqué par le stockage. `context` = identifiant pseudonyme pour
    la trace (jamais de PII). La rétention du bucket (M2-T20) rattrape un
    éventuel orphelin d'échec.

    - stockage non configuré (dev) ⇒ no-op silencieux ;
    - préfixe invalide (bug d'appelant) ⇒ trace DÉDIÉE (désaccord garde/appelant,
      distinct d'un simple incident) ;
    - incident de stockage / purge partielle ⇒ trace, effacement maintenu."""
    try:
        await delete_export_prefix(prefix)
    except StorageNotConfiguredError:
        pass
    except ValueError:
        logger.exception("purge RGPD refusée par le garde-fou [%s]", context)
    except Exception:  # noqa: BLE001 — l'effacement prime sur le stockage
        logger.exception("purge RGPD échouée [%s] (effacement maintenu)", context)


async def export_exists(object_name: str) -> bool:
    """Vrai si l'objet est présent dans le bucket (cache-hit vérifié, M2-T16).

    Un objet purgé par la rétention laisse `cv.gcs_pdf_url` pointer dans le
    vide : sans ce contrôle, le worker resservirait un cache mort et le
    téléchargement échouerait — le re-rendu est alors forcé."""
    _bucket_name()
    return await run_in_threadpool(_exists_sync, object_name)
