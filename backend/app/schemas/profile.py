"""
Pydantic schemas for user career profile data.

The canonical profile data models (PersonalInfo, Experience, Education, Skills,
Project, Certification, Language, ProfileData) are GENERATED from
`contracts/openapi.yaml` — see `app/generated/models.py`. This module re-exports
them so the rest of the codebase keeps importing from `app.schemas.profile`, and
defines the thin API envelopes (ProfileResponse, ProfileUpdate).

Do NOT hand-edit the profile field definitions here. Change
`contracts/openapi.yaml` (the single source of truth) and run
`make generate-types`.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.generated.models import (
    Certification,
    Education,
    Experience,
    Language,
    PersonalInfo,
    ProfileData,
    Project,
    Skills,
)

__all__ = [
    "PersonalInfo",
    "Experience",
    "Education",
    "Skills",
    "Project",
    "Certification",
    "Language",
    "ProfileData",
    "ProfileResponse",
    "ProfileUpdate",
]


class ProfileResponse(BaseModel):
    """API envelope returning a user's profile with metadata."""

    user_id: UUID
    profile_data: ProfileData
    # NOTE: kept naive-tolerant on purpose. The DB still stores naive datetimes
    # (datetime.utcnow()). M1-T06 migrates the whole codebase to timezone-aware
    # datetimes; the contract's AwareDatetime will apply once that lands.
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProfileUpdate(BaseModel):
    """API envelope for a full profile update."""

    profile_data: ProfileData
