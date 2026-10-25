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
import re

import httpx

from app.services import iam_auth

logger = logging.getLogger(__name__)

EXPORT_SERVICE_URL = os.getenv(
    "EXPORT_SERVICE_URL", "http://export-service:8004"
).rstrip("/")

# Chaîne des timeouts : rendu service 120 s < lecture client 130 s.
_TIMEOUT = httpx.Timeout(connect=5.0, read=130.0, write=30.0, pool=5.0)

# Plafond du PDF reçu (revue T14) : response.content charge tout en mémoire —
# un service défaillant renverrait un corps géant qui ferait tomber le backend
# (OOM) puis atterrirait dans GCS. Au-delà ⇒ erreur retryable, rien n'est stocké.
_MAX_PDF_BYTES = 20 * 1024 * 1024

# request_id de corrélation : format strict (revue T14, anti-injection d'en-tête
# CRLF). Une valeur hors format est IGNORÉE, pas propagée en l'état.
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

# Statuts 4xx TRANSITOIRES (revue T14) : rejouables malgré la classe 4xx.
_RETRYABLE_4XX = {408, 429}


class ExportUnavailableError(Exception):
    """Échec RETRYABLE (5xx, 408/429, timeout, réseau, réponse non-PDF) : rejouable."""


class ExportRejectedError(Exception):
    """Refus NON-retryable (4xx hors 408/429) : le payload est en cause (bug backend,
    contenu validé/coercé avant l'appel) ou l'IAM est mal configuré (401/403).
    Rejouer ne servirait à rien."""


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
    if request_id and _REQUEST_ID_RE.match(request_id):
        headers["x-request-id"] = request_id
    elif request_id:
        logger.warning("export-service : request_id hors format — ignoré")

    try:
        # follow_redirects=False EXPLICITE (revue T14) : un 3xx ne doit jamais
        # emporter le jeton OIDC vers un autre hôte — il tombe en « statut ≠ 200 ».
        async with httpx.AsyncClient(
            timeout=_TIMEOUT, follow_redirects=False
        ) as client:
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
    # 408/429 : échecs TRANSITOIRES malgré la classe 4xx ⇒ retryables (revue T14).
    if status in _RETRYABLE_4XX:
        logger.warning(
            "export-service : statut transitoire %s (rid=%s)", status, request_id
        )
        raise ExportUnavailableError(f"Rendu PDF indisponible (statut {status})")
    if 400 <= status < 500:
        # Jamais le corps : il peut décrire le payload (invalid_params).
        logger.error(
            "export-service : payload refusé (statut %s, rid=%s)", status, request_id
        )
        raise ExportRejectedError(f"Rendu PDF refusé par le service (statut {status})")
    if status != 200:
        logger.error(
            "export-service : erreur serveur (statut %s, rid=%s)", status, request_id
        )
        raise ExportUnavailableError(f"Rendu PDF indisponible (statut {status})")

    # Borne de taille (revue T14) : d'abord Content-Length si présent, puis la
    # taille réelle — un service défaillant peut mentir ou ne pas l'annoncer.
    declared = response.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > _MAX_PDF_BYTES:
        logger.error(
            "export-service : PDF annoncé trop volumineux (rid=%s)", request_id
        )
        raise ExportUnavailableError(
            "Rendu PDF indisponible (réponse trop volumineuse)"
        )

    content_type = response.headers.get("content-type", "")
    body = response.content
    if len(body) > _MAX_PDF_BYTES:
        logger.error("export-service : PDF reçu trop volumineux (rid=%s)", request_id)
        raise ExportUnavailableError(
            "Rendu PDF indisponible (réponse trop volumineuse)"
        )
    if "application/pdf" not in content_type or not body.startswith(b"%PDF-"):
        # 200 sans PDF = anomalie du service : erreur sûre, rien du corps ne sort.
        # content-type est un en-tête DISTANT → repr (anti-injection de ligne de log).
        logger.error(
            "export-service : réponse 200 sans PDF (content-type %r, rid=%s)",
            content_type,
            request_id,
        )
        raise ExportUnavailableError("Rendu PDF indisponible (réponse invalide)")
    return body
