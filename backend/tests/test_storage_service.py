"""M2-T15 — storage_service : bucket GCS privé des exports, sur ÉMULATEUR.

Critères (adaptés par ADR-EXPORT-DELIVERY, R2 tranché « download proxifié ») :
upload puis lecture sur l'émulateur fake-gcs-server ; fichier absent ⇒ erreur
TYPÉE propre (le « lien expiré » du contrat = fichier purgé ⇒ relancer
l'export) ; bucket non configuré ⇒ erreur explicite, jamais un appel réseau.

Prérequis local (comme la base postgres pour le reste de la suite) :
    docker run -d -p 4443:4443 fsouza/fake-gcs-server -scheme http
    STORAGE_EMULATOR_HOST=http://localhost:4443 pytest tests/test_storage_service.py
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

pytestmark = pytest.mark.skipif(
    not EMULATOR,
    reason="émulateur GCS absent (STORAGE_EMULATOR_HOST) — voir l'en-tête du fichier",
)


@pytest.fixture()
def bucket(monkeypatch):
    """Bucket éphémère créé sur l'émulateur, nom unique par test."""
    name = f"talentious-exports-test-{uuid.uuid4().hex[:8]}"
    monkeypatch.setattr(settings, "export_bucket_name", name)
    client = storage_service._client()
    client.create_bucket(name)
    yield name


@pytest.mark.asyncio
async def test_upload_puis_lecture(bucket):
    data = b"%PDF-1.7 contenu-export"
    await storage_service.upload_export(
        "exports/u1/empreinte1.pdf", data, "application/pdf"
    )
    assert await storage_service.download_export("exports/u1/empreinte1.pdf") == data


@pytest.mark.asyncio
async def test_fichier_absent_erreur_typee(bucket):
    with pytest.raises(ExportFileMissingError):
        await storage_service.download_export("exports/u1/inconnu.pdf")


@pytest.mark.asyncio
async def test_upload_ecrase_la_version_precedente(bucket):
    await storage_service.upload_export("exports/u1/e.pdf", b"v1", "application/pdf")
    await storage_service.upload_export("exports/u1/e.pdf", b"v2", "application/pdf")
    assert await storage_service.download_export("exports/u1/e.pdf") == b"v2"


@pytest.mark.asyncio
async def test_delete_puis_lecture_refusee(bucket):
    await storage_service.upload_export("exports/u1/d.pdf", b"x", "application/pdf")
    await storage_service.delete_export("exports/u1/d.pdf")
    with pytest.raises(ExportFileMissingError):
        await storage_service.download_export("exports/u1/d.pdf")


@pytest.mark.asyncio
async def test_delete_idempotent(bucket):
    await storage_service.delete_export("exports/u1/jamais-cree.pdf")  # ne lève pas


@pytest.mark.asyncio
async def test_bucket_non_configure_erreur_explicite_sans_reseau(monkeypatch):
    monkeypatch.setattr(settings, "export_bucket_name", "")
    with pytest.raises(StorageNotConfiguredError):
        await storage_service.download_export("exports/u1/x.pdf")
    with pytest.raises(StorageNotConfiguredError):
        await storage_service.upload_export("exports/u1/x.pdf", b"x", "application/pdf")
