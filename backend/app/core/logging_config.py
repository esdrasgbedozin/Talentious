"""
Logging structuré JSON (pilier méthodo §2) + corrélation de requête.

Émet une ligne JSON par log sur stdout, avec le champ `severity` reconnu par
Cloud Logging (coloration/filtrage natifs sur Cloud Run) et un `request_id`
propagé par middleware pour corréler toutes les lignes d'une même requête.
"""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# Identifiant de la requête courante, posé par le middleware, lu par le formatteur.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# Attributs standard d'un LogRecord : tout le reste est considéré comme un
# champ « extra » passé via logger.info(..., extra={...}) et sérialisé tel quel.
_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()) | {
    "message",
    "asctime",
    "taskName",
}

# Niveaux Python → sévérités Cloud Logging (mêmes noms, mappage explicite).
_SEVERITY = {
    "DEBUG": "DEBUG",
    "INFO": "INFO",
    "WARNING": "WARNING",
    "ERROR": "ERROR",
    "CRITICAL": "CRITICAL",
}


class JsonFormatter(logging.Formatter):
    """Rend chaque LogRecord en une ligne JSON (Cloud Logging friendly)."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "severity": _SEVERITY.get(record.levelname, record.levelname),
            "timestamp": datetime.fromtimestamp(
                record.created, timezone.utc
            ).isoformat(),
            "message": record.getMessage(),
            "logger": record.name,
        }

        rid = request_id_var.get()
        if rid:
            payload["request_id"] = rid

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        # Champs « extra » applicatifs (user_id, job_id, …).
        for key, value in record.__dict__.items():
            if key not in _RESERVED and key not in payload and not key.startswith("_"):
                payload[key] = value

        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Installe le formatteur JSON sur le logger racine et aligne uvicorn.

    Idempotent : remplace les handlers existants (évite les doublons texte).
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # Uvicorn/Gunicorn posent leurs propres handlers texte : on les fait
    # propager vers la racine pour tout uniformiser en JSON.
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "gunicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True
