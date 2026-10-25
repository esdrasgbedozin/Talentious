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


@pytest.mark.asyncio
async def test_bucket_non_configure_erreur_explicite_sans_reseau(monkeypatch):
    """Sans émulateur : bucket vide ⇒ erreur AVANT tout réseau (revue T15)."""
    monkeypatch.setattr(settings, "export_bucket_name", "")
    for call in (
        storage_service.download_export("exports/u1/x.pdf"),
        storage_service.upload_export("exports/u1/x.pdf", b"x", "application/pdf"),
        storage_service.export_exists("exports/u1/x.pdf"),
        storage_service.delete_export("exports/u1/x.pdf"),
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
