"""
Jobs d'import de CV — éphémères, en mémoire, JAMAIS persistés.

Le brouillon extrait d'un PDF ne touche jamais la base : il attend ici (≤ 15
minutes) que le client vienne le chercher par polling, puis disparaît. C'est
le prolongement du principe « relecture humaine obligatoire » de l'import.

Hypothèse d'exploitation : le backend tourne à UNE instance maximum (déjà
imposé par le rate limiter in-memory — cf. infra/services.tf). Un redémarrage
perd les jobs en cours : le client reçoit 404 et propose de relancer l'import.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

JOB_TTL = timedelta(minutes=15)

STATUS_RUNNING = "running"
STATUS_SUCCEEDED = "succeeded"
STATUS_FAILED = "failed"


@dataclass
class ImportJob:
    id: str
    user_id: str
    status: str = STATUS_RUNNING
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    profile_data: Optional[dict] = None
    warnings: Optional[list] = None
    error_message: Optional[str] = None

    @property
    def expired(self) -> bool:
        return datetime.now(timezone.utc) - self.created_at > JOB_TTL


class ImportJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, ImportJob] = {}

    def _purge_expired(self) -> None:
        for job_id in [j.id for j in self._jobs.values() if j.expired]:
            del self._jobs[job_id]

    def create(self, user_id: Any) -> ImportJob:
        self._purge_expired()
        job = ImportJob(id=str(uuid.uuid4()), user_id=str(user_id))
        self._jobs[job.id] = job
        return job

    def has_active(self, user_id: Any) -> bool:
        self._purge_expired()
        return any(
            j.user_id == str(user_id) and j.status == STATUS_RUNNING
            for j in self._jobs.values()
        )

    def get(self, job_id: str, user_id: Any) -> Optional[ImportJob]:
        """Job du propriétaire uniquement ; inconnu, expiré ou étranger → None
        (le client ne peut pas distinguer ces cas — pas d'énumération)."""
        self._purge_expired()
        job = self._jobs.get(job_id)
        if job is None or job.user_id != str(user_id):
            return None
        return job

    def succeed(self, job_id: str, profile_data: dict, warnings: list) -> None:
        job = self._jobs.get(job_id)
        if job is not None:
            job.status = STATUS_SUCCEEDED
            job.profile_data = profile_data
            job.warnings = warnings

    def fail(self, job_id: str, error_message: str) -> None:
        job = self._jobs.get(job_id)
        if job is not None:
            job.status = STATUS_FAILED
            job.error_message = error_message

    def reset(self) -> None:
        """Tests uniquement."""
        self._jobs.clear()


import_job_store = ImportJobStore()
