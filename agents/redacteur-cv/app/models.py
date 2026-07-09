"""
Pydantic models for CV Generator API request/response validation.

INPUT models mirror the canonical ProfileData contract
(contracts/openapi.yaml) so the backend can forward the stored profile as-is,
with NO runtime transformation. In particular:
- skills is the canonical `{hard: string[], soft: string[]}` object (not a list),
- certifications use issuer / issue_date / expiration_date / credential_url,
- languages are `{name, level}`,
- experiences carry achievements / is_current, projects carry role.

OUTPUT date fields are optional to avoid 422s when the model omits a date.
"""

from typing import List, Optional

from pydantic import BaseModel, Field


# ==================== INPUT MODELS ====================


class SkillItem(BaseModel):
    """Individual skill item from offer analysis"""

    name: str = Field(..., description="Skill name")
    level: Optional[str] = Field(None, description="Required level (e.g., 'Expert')")
    importance: Optional[str] = Field(
        None, description="Importance (Critical, Important, Nice to have)"
    )


class OfferAnalysis(BaseModel):
    """Job offer analysis result from Analyseur-Offre agent"""

    hard_skills: List[SkillItem] = Field(..., description="Technical skills required")
    soft_skills: List[SkillItem] = Field(..., description="Soft skills required")
    seniority_level: str = Field(..., description="Required seniority level")
    key_responsibilities: List[str] = Field(..., description="Main responsibilities")
    tone: str = Field(..., description="Tone of the job offer")


class PersonalInfo(BaseModel):
    """Personal information from user profile (canonical ProfileData.personal_info)"""

    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None


class Experience(BaseModel):
    """Work experience entry"""

    id: str
    title: str
    company: str
    start_date: str  # YYYY-MM
    end_date: Optional[str] = None  # YYYY-MM or null for current
    is_current: bool = False
    description: str
    location: Optional[str] = None
    achievements: Optional[List[str]] = None


class Education(BaseModel):
    """Education entry"""

    id: str
    degree: str
    field: Optional[str] = None  # Field of study
    institution: str
    start_date: Optional[str] = None  # YYYY-MM
    end_date: Optional[str] = None  # YYYY-MM (graduation date)
    location: Optional[str] = None
    description: Optional[str] = None
    grade: Optional[str] = None


class Skills(BaseModel):
    """Canonical skills structure `{hard: [...], soft: [...]}` (no transformation)."""

    hard: List[str] = Field(default_factory=list)
    soft: List[str] = Field(default_factory=list)


class Language(BaseModel):
    """Language proficiency from profile (canonical `{name, level}`)."""

    name: str
    level: str  # e.g., "Native", "Fluent", "Intermediate"


class Project(BaseModel):
    """Project entry"""

    id: str
    name: str
    description: str
    role: Optional[str] = None
    technologies: Optional[List[str]] = None
    start_date: Optional[str] = None  # YYYY-MM
    end_date: Optional[str] = None  # YYYY-MM
    url: Optional[str] = None


class Certification(BaseModel):
    """Certification entry (canonical field names)."""

    id: str
    name: str
    issuer: str
    issue_date: Optional[str] = None  # YYYY-MM
    expiration_date: Optional[str] = None  # YYYY-MM
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None


class UserProfileData(BaseModel):
    """Complete user profile data from backend (canonical ProfileData)."""

    personal_info: PersonalInfo
    summary: Optional[str] = None
    experiences: List[Experience] = Field(default_factory=list)
    educations: List[Education] = Field(default_factory=list)
    skills: Skills = Field(default_factory=Skills)
    languages: List[Language] = Field(default_factory=list)
    projects: List[Project] = Field(default_factory=list)
    certifications: List[Certification] = Field(default_factory=list)


class GenerateRequest(BaseModel):
    """Request model for CV generation (offer analysis + user profile)."""

    offer_analysis: OfferAnalysis = Field(..., description="Job offer analysis")
    user_profile: UserProfileData = Field(..., description="User's complete profile")


# ==================== OUTPUT MODELS ====================


class SelectedExperience(BaseModel):
    """Optimized work experience for the target job offer"""

    id: str = Field(..., description="Original experience ID")
    title: str
    company: str
    start_date: str
    end_date: Optional[str] = None
    location: Optional[str] = None
    description: str = Field(
        ...,
        description="Rewritten description optimized for the target job offer",
    )
    highlighted_skills: List[str] = Field(
        ..., description="Skills demonstrated in this experience matching the offer"
    )


class HighlightedSkill(BaseModel):
    """Skill prioritized for the target job offer"""

    name: str
    level: Optional[str] = None
    category: str = Field(..., description="hard_skill or soft_skill")
    importance: str = Field(..., description="Critical, Important, Nice to have")


class SelectedEducation(BaseModel):
    """Education entry relevant for the target job"""

    id: str
    degree: str
    institution: str
    end_date: Optional[str] = None  # graduation date, optional (was required -> 422)
    field: Optional[str] = None
    description: Optional[str] = None


class SelectedProject(BaseModel):
    """Project relevant for the target job"""

    id: str
    name: str
    description: str
    url: Optional[str] = None
    completion_date: Optional[str] = None
    relevant_skills: List[str] = Field(
        default_factory=list, description="Skills demonstrated that match the offer"
    )


class SelectedCertification(BaseModel):
    """Certification relevant for the target job"""

    id: str
    name: str
    issuer: str
    issue_date: Optional[str] = None  # optional (was required -> 422)
    credential_url: Optional[str] = None


class GeneratedCVData(BaseModel):
    """Complete optimized CV structure — final output of the Rédacteur-CV agent."""

    personal_info: PersonalInfo = Field(..., description="Personal information")
    summary: str = Field(
        ..., description="Rewritten professional summary targeting the job offer"
    )
    selected_experiences: List[SelectedExperience] = Field(
        ..., description="Experiences selected and optimized (3-5 most relevant)"
    )
    highlighted_skills: List[HighlightedSkill] = Field(
        ..., description="Skills prioritized and categorized (8-15)"
    )
    selected_educations: List[SelectedEducation] = Field(
        default_factory=list, description="Education entries relevant for the job"
    )
    selected_projects: List[SelectedProject] = Field(
        default_factory=list, description="Projects relevant for the job (0-3)"
    )
    selected_certifications: List[SelectedCertification] = Field(
        default_factory=list, description="Certifications relevant for the job (0-5)"
    )


class GenerateResponse(BaseModel):
    """Response model for CV generation endpoint"""

    cv_data: GeneratedCVData = Field(..., description="Generated and optimized CV data")
    message: str = Field(default="CV generated successfully")
