"""Worker d'export PDF (M2-T16) — `job_type=export`.

Pipeline : charger le job (idempotence : seuls les jobs QUEUED sont traités) +
le CV (OWNERSHIP revérifié — anti-IDOR : un CV d'autrui répond comme un CV
inexistant), RECOERCER le contenu (défense en profondeur : le stock peut
porter du pré-ceinture corrompu, le rendu ne reçoit JAMAIS le brut), résoudre
l'enveloppe (thème snapshot NORMALISÉ, repli anthracite si corrompu — même
doctrine que routes/cv.py), puis :

- CACHE PAR EMPREINTE : l'objet GCS est nommé
  ``exports/{user_id}/{cv_id}/{sha256(contenu+template+thème+langue+format+RENDER_VERSION)}.pdf``.
  Si ``cv.gcs_pdf_url`` pointe déjà cette empreinte ET que l'objet EXISTE
  encore dans le bucket, le fichier est RESSERVI sans nouveau rendu (critère
  du ticket) — toute modification du contenu, de l'enveloppe ou de la version
  de rendu change l'empreinte ; une purge de rétention force le re-rendu ;
- sinon : rendu via export_client (request_id = id du job, corrélation T12),
  upload bucket privé (ADR-EXPORT-DELIVERY), empreinte mémorisée, ANCIEN objet
  supprimé (RGPD : pas de PDF orphelin qui traîne jusqu'à la rétention).

Les échecs portent des messages SÛRS (jamais un statut ni un détail interne —
``error_message`` est montré à l'utilisateur). Le worker ne laisse JAMAIS un
job en RUNNING : tout échec (y compris une session de base cassée ou une
annulation de tâche) le passe en FAILED via une session NEUVE.

NB — reprise des jobs tués en vol (instance Cloud Run arrêtée pendant le
rendu) : hors périmètre T16, routé au REAPER M6-T03 (ADR-JOBS). Ce worker
garantit seulement de ne jamais s'infliger lui-même un job coincé.
"""

import asyncio
import hashlib
import json
import logging
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.generated.models import CVThemeTokens
from app.models import CVJob, JobStatus, JobType
from app.models.generated_cv import ANTHRACITE_TOKENS, GeneratedCV
from app.services import export_client, storage_service
from app.services.cv_content_coercion import CVContentCoercionError, coerce_cv_content
from app.services.cv_worker import DEFAULT_TEMPLATE_ID

logger = logging.getLogger(__name__)

# Version du MOTEUR de rendu : à incrémenter à CHAQUE changement visible du PDF
# (template, CSS du package, export-service). Entre dans l'empreinte ⇒ un rendu
# daté est re-produit au lieu d'être resservi depuis le cache (revue T16, C2).
RENDER_VERSION = 1

# Seul format géré par ce worker (le docx — colonne gcs_docx_url distincte — est
# M8-T05). Paramétré dans l'empreinte et le nom d'objet pour qu'un futur format
# n'écrase jamais le pointeur PDF (revue T16, C4).
_FORMAT = "pdf"

MSG_CV_INTROUVABLE = "CV introuvable — relancer l'export depuis un CV existant."
MSG_CONTENU_INVALIDE = "Le contenu de ce CV n'est pas exportable — le régénérer."
MSG_INDISPONIBLE = (
    "Le rendu PDF est temporairement indisponible — réessayer dans quelques minutes."
)
MSG_INTERNE = "L'export a échoué — réessayer, puis nous contacter si cela persiste."


def _resolve_theme(cv: GeneratedCV) -> dict[str, Any]:
    """Thème snapshot VALIDÉ ET NORMALISÉ, repli anthracite si corrompu.

    model_dump après validation (revue T16, C3) : clés inconnues/superflues
    écartées, ordre canonique — l'empreinte et le payload de rendu sont ceux
    que le service recevra, pas le dict brut stocké."""
    try:
        return CVThemeTokens.model_validate(cv.theme_json).model_dump(mode="json")
    except ValidationError:
        logger.warning(
            "theme_json corrompu — rendu en repli anthracite",
            extra={"cv_id": str(cv.id)},
        )
        return dict(ANTHRACITE_TOKENS)


def _fingerprint(
    cv_content: dict[str, Any],
    template_id: str,
    theme: dict[str, Any],
    language: str,
    fmt: str,
) -> str:
    """Empreinte stable et COMPLÈTE du rendu (clé du cache). Toute dimension qui
    change le PDF doit y entrer — y compris la version du moteur (C2)."""
    canonical = json.dumps(
        {
            "cv_content": cv_content,
            "template_id": template_id,
            "theme": theme,
            "language": language,
            "format": fmt,
            "render_version": RENDER_VERSION,
        },
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def run_export_job(session_factory: async_sessionmaker, job_id: UUID) -> None:
    """Exécute un job d'export PDF et met à jour son statut (jamais d'exception sortante)."""
    async with session_factory() as db:
        job = await db.get(CVJob, job_id)
        if job is None:
            logger.error("run_export_job: job %s introuvable", job_id)
            return
        if job.job_type is not JobType.EXPORT:
            logger.error(
                "run_export_job: job %s de type %s — refusé", job_id, job.job_type
            )
            return
        # Idempotence (revue T16, C6) : ne JAMAIS ressusciter un job déjà traité
        # ou en cours — une double livraison ne doit pas provoquer un second
        # rendu ni violer l'index unique (user, export).
        if job.status is not JobStatus.QUEUED:
            logger.warning(
                "run_export_job: job %s au statut %s (≠ queued) — ignoré",
                job_id,
                job.status.value,
            )
            return

        try:
            await _process(db, job, session_factory)
        except asyncio.CancelledError:
            # Arrêt/annulation de la tâche : marquer FAILED AVANT de relancer,
            # sinon le job reste RUNNING et bloque les exports de l'utilisateur
            # (revue T16, B1). Le reaper M6-T03 couvre le kill brutal du process.
            await _mark_failed(session_factory, job_id, MSG_INTERNE)
            raise
        except Exception:
            logger.exception("export: échec inattendu", extra={"job_id": str(job_id)})
            await _mark_failed(session_factory, job_id, MSG_INTERNE)


async def _process(db, job: CVJob, session_factory: async_sessionmaker) -> None:
    """Corps du rendu. Toute erreur TYPÉE y est traduite en FAILED (message sûr) ;
    les erreurs imprévues remontent à run_export_job (dernier rempart)."""
    job.status = JobStatus.RUNNING
    job.progress_pct = 10
    await db.commit()

    cv = await db.get(GeneratedCV, job.cv_id) if job.cv_id else None
    # Anti-IDOR : un CV d'autrui répond EXACTEMENT comme un inexistant.
    if cv is None or cv.user_id != job.user_id:
        await _mark_failed(session_factory, job.id, MSG_CV_INTROUVABLE)
        return

    # Recoercition DÉFENSIVE : liste blanche stricte avant tout rendu.
    try:
        cv_content, _warnings = coerce_cv_content(cv.cv_data_json)
    except CVContentCoercionError:
        logger.error("export: contenu non coerçable", extra={"cv_id": str(cv.id)})
        await _mark_failed(session_factory, job.id, MSG_CONTENU_INVALIDE)
        return

    template_id = cv.template_id or DEFAULT_TEMPLATE_ID
    theme = _resolve_theme(cv)
    language = cv.language.value if hasattr(cv.language, "value") else str(cv.language)

    fingerprint = _fingerprint(cv_content, template_id, theme, language, _FORMAT)
    object_name = f"exports/{job.user_id}/{cv.id}/{fingerprint}.{_FORMAT}"

    try:
        # CACHE : même empreinte ET objet toujours présent ⇒ resservi sans
        # nouveau rendu (revue T16, C1 : un objet purgé force le re-rendu).
        if cv.gcs_pdf_url == object_name and await storage_service.export_exists(
            object_name
        ):
            logger.info(
                "export resservi depuis le cache",
                extra={"job_id": str(job.id), "cv_id": str(cv.id)},
            )
            job.status = JobStatus.SUCCEEDED
            job.progress_pct = 100
            await db.commit()
            return

        job.progress_pct = 40
        await db.commit()
        pdf = await export_client.render_pdf(
            cv_content=cv_content,
            template_id=template_id,
            theme=theme,
            language=language,
            request_id=str(job.id),
        )

        job.progress_pct = 80
        await db.commit()
        await storage_service.upload_export(object_name, pdf, "application/pdf")

        # RGPD (revue T16, C5) : retirer l'ancien PDF orphelin après le nouvel
        # upload (échec toléré — un objet qui traîne n'empêche pas le succès).
        previous = cv.gcs_pdf_url
        if previous and previous != object_name:
            try:
                await storage_service.delete_export(previous)
            except Exception:
                logger.warning(
                    "export: ancien objet non supprimé", extra={"cv_id": str(cv.id)}
                )

        cv.gcs_pdf_url = object_name
        job.status = JobStatus.SUCCEEDED
        job.progress_pct = 100
        await db.commit()

    except export_client.ExportUnavailableError:
        await _mark_failed(session_factory, job.id, MSG_INDISPONIBLE)
    except export_client.ExportRejectedError:
        # Payload refusé alors que le contenu est coercé : bug backend.
        logger.error(
            "export: payload refusé par le service (bug backend probable)",
            extra={"job_id": str(job.id)},
        )
        await _mark_failed(session_factory, job.id, MSG_INTERNE)
    except storage_service.StorageNotConfiguredError:
        logger.error("export: stockage non configuré")
        await _mark_failed(session_factory, job.id, MSG_INDISPONIBLE)


async def _mark_failed(
    session_factory: async_sessionmaker, job_id: UUID, message: str
) -> None:
    """Passe un job en FAILED via une session NEUVE (revue T16, B1).

    Une session dont le commit a échoué est en « rollback requis » : y
    re-committer relèverait et laisserait le job RUNNING. On ouvre donc une
    session propre ; et même cette écriture est protégée — un échec ici est
    journalisé, jamais propagé (le reaper M6-T03 est le dernier filet)."""
    try:
        async with session_factory() as db:
            job = await db.get(CVJob, job_id)
            if job is None:
                return
            job.status = JobStatus.FAILED
            job.error_message = message
            await db.commit()
    except Exception:
        logger.exception(
            "export: impossible de marquer le job FAILED",
            extra={"job_id": str(job_id)},
        )
