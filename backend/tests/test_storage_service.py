"""M2-T15 — storage_service : bucket GCS privé des exports, sur ÉMULATEUR.

Critères (adaptés par ADR-EXPORT-DELIVERY, R2 tranché « download proxifié ») :
upload puis lecture sur l'émulateur fake-gcs-server ; fichier absent ⇒ erreur
TYPÉE propre (le « lien expiré » du contrat = fichier purgé ⇒ relancer
l'export) ; bucket non configuré ⇒ erreur explicite, jamais un appel réseau.

Prérequis local (comme la base postgres pour le reste de la suite) :
    docker run -d -p 4443:4443 fsouza/fake-gcs-server -scheme http
    STORAGE_EMULATOR_HOST=http://localhost:4443 pytest tests/test_storage_service.py
En CI : service `fake-gcs` du job `test` (deploy-prod.yml).
"""

import os
import uuid
from unittest.mock import AsyncMock

import pytest

from app.config import settings
from app.services import storage_service
from app.services.storage_service import (
    ExportFileMissingError,
    StorageNotConfiguredError,
)

EMULATOR = os.getenv("STORAGE_EMULATOR_HOST")

# Skip PAR TEST (revue T15) : le test « bucket non configuré » et la garde
# émulateur-en-prod n'ont PAS besoin de l'émulateur et doivent toujours tourner.
requires_emulator = pytest.mark.skipif(
    not EMULATOR,
    reason="émulateur GCS absent (STORAGE_EMULATOR_HOST) — voir l'en-tête du fichier",
)


@pytest.fixture()
def bucket(monkeypatch):
    """Bucket éphémère sur l'émulateur, nom unique, supprimé après le test ;
    le client mémoïsé est vidé avant et après (revue T15)."""
    storage_service._client.cache_clear()
    name = f"talentious-exports-test-{uuid.uuid4().hex[:8]}"
    monkeypatch.setattr(settings, "export_bucket_name", name)
    client = storage_service._client()
    bkt = client.create_bucket(name)
    yield name
    try:
        for blob in client.list_blobs(name):
            blob.delete()
        bkt.delete()
    except Exception:
        pass
    storage_service._client.cache_clear()


@requires_emulator
@pytest.mark.asyncio
async def test_upload_puis_lecture(bucket):
    data = b"%PDF-1.7 contenu-export"
    await storage_service.upload_export("exports/u1/e1.pdf", data, "application/pdf")
    assert await storage_service.download_export("exports/u1/e1.pdf") == data


@requires_emulator
@pytest.mark.asyncio
async def test_fichier_absent_erreur_typee_sans_nom_dans_le_message(bucket):
    with pytest.raises(ExportFileMissingError) as exc:
        await storage_service.download_export("exports/u1/inconnu.pdf")
    # Le nom d'objet est dans l'attribut, JAMAIS dans le message (revue T15).
    assert "inconnu.pdf" not in str(exc.value)
    assert exc.value.object_name == "exports/u1/inconnu.pdf"


@requires_emulator
@pytest.mark.asyncio
async def test_upload_ecrase_la_version_precedente(bucket):
    await storage_service.upload_export("exports/u1/e.pdf", b"v1", "application/pdf")
    await storage_service.upload_export("exports/u1/e.pdf", b"v2", "application/pdf")
    assert await storage_service.download_export("exports/u1/e.pdf") == b"v2"


@requires_emulator
@pytest.mark.asyncio
async def test_delete_puis_lecture_refusee(bucket):
    await storage_service.upload_export("exports/u1/d.pdf", b"x", "application/pdf")
    await storage_service.delete_export("exports/u1/d.pdf")
    with pytest.raises(ExportFileMissingError):
        await storage_service.download_export("exports/u1/d.pdf")


@requires_emulator
@pytest.mark.asyncio
async def test_delete_idempotent(bucket):
    await storage_service.delete_export("exports/u1/jamais-cree.pdf")  # ne lève pas


@requires_emulator
@pytest.mark.asyncio
async def test_export_exists(bucket):
    assert await storage_service.export_exists("exports/u1/x.pdf") is False
    await storage_service.upload_export("exports/u1/x.pdf", b"%PDF-", "application/pdf")
    assert await storage_service.export_exists("exports/u1/x.pdf") is True


@requires_emulator
@pytest.mark.asyncio
async def test_upload_refuse_un_export_trop_volumineux(bucket):
    with pytest.raises(ValueError):
        await storage_service.upload_export(
            "exports/u1/gros.pdf", b"x" * (21 * 1024 * 1024), "application/pdf"
        )


@requires_emulator
@pytest.mark.asyncio
async def test_delete_export_prefix_purge_ciblee(bucket):
    """Purge RGPD : efface TOUT sous le préfixe d'un user/CV, et RIEN d'un autre."""
    u_a, u_b = uuid.uuid4(), uuid.uuid4()
    cv = uuid.uuid4()
    pref_a = f"exports/{u_a}/{cv}/"
    await storage_service.upload_export(f"{pref_a}e1.pdf", b"%PDF-1", "application/pdf")
    await storage_service.upload_export(f"{pref_a}e2.pdf", b"%PDF-2", "application/pdf")
    await storage_service.upload_export(
        f"exports/{u_b}/{uuid.uuid4()}/autre.pdf", b"%PDF-B", "application/pdf"
    )
    deleted = await storage_service.delete_export_prefix(pref_a)
    assert deleted == 2
    assert await storage_service.export_exists(f"{pref_a}e1.pdf") is False
    assert await storage_service.export_exists(f"{pref_a}e2.pdf") is False
    # L'export d'un AUTRE utilisateur est intact (pas de sur-purge).
    assert (
        len(
            list(storage_service._client().list_blobs(bucket, prefix=f"exports/{u_b}/"))
        )
        == 1
    )


@requires_emulator
@pytest.mark.asyncio
async def test_delete_export_prefix_idempotent(bucket):
    """Purger un préfixe sans aucun objet ⇒ 0, sans erreur."""
    assert await storage_service.delete_export_prefix(f"exports/{uuid.uuid4()}/") == 0


@pytest.mark.parametrize(
    "mauvais",
    [
        "",  # vide ⇒ effacerait tout le bucket
        "exports/",  # pas d'UUID ⇒ tous les users
        "exports/not-a-uuid/",  # UUID malformé
        "exports/" + str(uuid.uuid4()),  # pas de / final ⇒ engloberait les voisins
        "autre/" + str(uuid.uuid4()) + "/",  # pas ancré sur exports/
        str(uuid.uuid4()) + "/",  # pas de racine exports/
        # sous-chemin arbitraire au-delà de {user}/{cv}/ ⇒ refusé par fullmatch
        f"exports/{uuid.uuid4()}/{uuid.uuid4()}/sous/",
        f"exports/{uuid.uuid4()}/../{uuid.uuid4()}/",  # traversée refusée (fullmatch)
    ],
)
@pytest.mark.asyncio
async def test_delete_export_prefix_refuse_prefixe_dangereux(monkeypatch, mauvais):
    """Garde-fou FAIL-CLOSED : un préfixe trop large lève ValueError AVANT réseau
    (jamais de purge catastrophique). Le client GCS n'est même pas sollicité."""
    monkeypatch.setattr(settings, "export_bucket_name", "un-bucket")
    appels = []
    monkeypatch.setattr(
        storage_service, "_delete_prefix_sync", lambda p: appels.append(p)
    )
    with pytest.raises(ValueError):
        await storage_service.delete_export_prefix(mauvais)
    assert appels == []  # jamais exécuté sur un préfixe refusé


@pytest.mark.asyncio
async def test_bucket_non_configure_erreur_explicite_sans_reseau(monkeypatch):
    """Sans émulateur : bucket vide ⇒ erreur AVANT tout réseau (revue T15)."""
    monkeypatch.setattr(settings, "export_bucket_name", "")
    for call in (
        storage_service.download_export("exports/u1/x.pdf"),
        storage_service.upload_export("exports/u1/x.pdf", b"x", "application/pdf"),
        storage_service.export_exists("exports/u1/x.pdf"),
        storage_service.delete_export("exports/u1/x.pdf"),
        storage_service.delete_export_prefix(f"exports/{uuid.uuid4()}/"),
    ):
        with pytest.raises(StorageNotConfiguredError):
            await call


def test_emulateur_interdit_hors_development(monkeypatch):
    """Garde défense en profondeur : STORAGE_EMULATOR_HOST hors dev ⇒ refus."""
    storage_service._client.cache_clear()
    monkeypatch.setenv("STORAGE_EMULATOR_HOST", "http://localhost:4443")
    monkeypatch.setattr(settings, "environment", "production")
    with pytest.raises(RuntimeError, match="hors development"):
        storage_service._client()
    storage_service._client.cache_clear()


def test_export_prefix_builder():
    """Source UNIQUE du préfixe (écriture == purge)."""
    assert storage_service.export_prefix("u1") == "exports/u1/"
    assert storage_service.export_prefix("u1", "c1") == "exports/u1/c1/"


@pytest.mark.parametrize(
    "exc",
    [
        StorageNotConfiguredError("dev"),
        ValueError("préfixe invalide"),
        RuntimeError("GCS down"),
    ],
)
@pytest.mark.asyncio
async def test_safe_delete_export_prefix_ne_leve_jamais(monkeypatch, exc):
    """Le wrapper best-effort absorbe TOUTES les erreurs (effacement non bloqué)."""
    monkeypatch.setattr(
        storage_service, "delete_export_prefix", AsyncMock(side_effect=exc)
    )
    # Ne doit lever aucune exception, quel que soit l'incident.
    await storage_service.safe_delete_export_prefix("exports/u/", context="t")


def test_delete_prefix_sync_continue_sur_erreur_unitaire(monkeypatch):
    """Un blob.delete en erreur NE stoppe PAS la purge : les autres sont tentés,
    puis un bilan est levé (revue T28)."""

    class _Blob:
        def __init__(self, fail):
            self.fail = fail
            self.deleted = False

        def delete(self, timeout=None):
            if self.fail:
                raise RuntimeError("boom")
            self.deleted = True

    b1, b2, b3 = _Blob(False), _Blob(True), _Blob(False)

    class _Client:
        def bucket(self, name):
            return object()

        def list_blobs(self, bucket, prefix=None, timeout=None):
            return [b1, b2, b3]

    monkeypatch.setattr(storage_service, "_client", lambda: _Client())
    monkeypatch.setattr(settings, "export_bucket_name", "un-bucket")
    with pytest.raises(RuntimeError, match="partielle"):
        storage_service._delete_prefix_sync("exports/x/")
    # b1 et b3 sont bien supprimés malgré l'échec de b2 (pas d'arrêt au 1er échec).
    assert b1.deleted and b3.deleted
