"""Client HTTP de l'export-service (rendu PDF) — M2-T14.

Appelé par le worker d'export (M2-T16), jamais directement par une route.
Différences VOULUES avec le pattern historique des clients agents :

- mapping d'erreurs SÛR : le corps renvoyé par le service n'est JAMAIS
  reflété dans l'exception ni les messages (seul le statut l'est) — les
  erreurs remontent au job puis potentiellement à l'utilisateur ;
- exceptions TYPÉES retryable / non-retryable (le worker décide quoi rejouer) ;
- propagation du ``x-request-id`` (corrélation de bout en bout, M2-T12) ;
- timeouts alignés sur la chaîne documentée dans ADR-RENDER-SECURITY
  (décision 7) : le service coupe à 120 s ⇒ le client attend un peu PLUS
  (130 s de lecture) pour recevoir le 504 typé plutôt que de couper avant.
"""

import logging
import os

import httpx

from app.services import iam_auth

logger = logging.getLogger(__name__)

EXPORT_SERVICE_URL = os.getenv(
    "EXPORT_SERVICE_URL", "http://export-service:8004"
).rstrip("/")

# Chaîne des timeouts : rendu service 120 s < lecture client 130 s.
_TIMEOUT = httpx.Timeout(connect=5.0, read=130.0, write=30.0, pool=5.0)


class ExportUnavailableError(Exception):
    """Échec RETRYABLE (5xx, timeout, réseau, réponse non-PDF) : le job peut rejouer."""


class ExportRejectedError(Exception):
    """Refus NON-retryable (4xx) : le payload envoyé est en cause — bug backend,
    puisque le contenu est validé/coercé avant l'appel. Rejouer ne servirait à rien."""


async def render_pdf(
    *,
    cv_content: dict,
    template_id: str,
    theme: dict,
    language: str,
    request_id: str | None = None,
) -> bytes:
    """Rend un CV en PDF via l'export-service et renvoie les octets du document."""
    payload = {
        "cv_content": cv_content,
        "template_id": template_id,
        "theme": theme,
        "language": language,
    }
    headers = await iam_auth.auth_headers(EXPORT_SERVICE_URL)
    if request_id:
        headers["x-request-id"] = request_id

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{EXPORT_SERVICE_URL}/render/pdf", json=payload, headers=headers
            )
    except httpx.TimeoutException as exc:
        logger.error("export-service : timeout (%s)", type(exc).__name__)
        raise ExportUnavailableError("Rendu PDF indisponible (timeout)") from exc
    except httpx.RequestError as exc:
        logger.error("export-service : erreur réseau (%s)", type(exc).__name__)
        raise ExportUnavailableError("Rendu PDF indisponible (réseau)") from exc

    status = response.status_code
    if 400 <= status < 500:
        # Jamais le corps : il peut décrire le payload (invalid_params).
        logger.error("export-service : payload refusé (statut %s)", status)
        raise ExportRejectedError(f"Rendu PDF refusé par le service (statut {status})")
    if status != 200:
        logger.error("export-service : erreur serveur (statut %s)", status)
        raise ExportUnavailableError(f"Rendu PDF indisponible (statut {status})")

    content_type = response.headers.get("content-type", "")
    body = response.content
    if "application/pdf" not in content_type or not body.startswith(b"%PDF-"):
        # 200 sans PDF = anomalie du service : erreur sûre, rien du corps ne sort.
        logger.error(
            "export-service : réponse 200 sans PDF (content-type %s)", content_type
        )
        raise ExportUnavailableError("Rendu PDF indisponible (réponse invalide)")
    return body
