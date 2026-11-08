"""
Pydantic models for API request/response validation
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

from app.services.keyword_coercion import (
    MAX_ALIASES,
    MAX_KEYWORDS,
    MAX_NAME_LEN,
    coerce_keywords,
)


class AnalyzeRequest(BaseModel):
    """
    Request model for text-based job offer analysis
    """

    text: str = Field(
        ...,
        min_length=50,
        max_length=200000,  # 200K chars - Gemini 1.5 Flash has 1M token context window (~750K chars)
        description="Job offer text to analyze (50-200,000 characters)",
    )


class SkillItem(BaseModel):
    """
    Individual skill item (used for both hard and soft skills)
    """

    name: str = Field(..., description="Skill name")
    level: Optional[str] = Field(
        None,
        description="Required level (e.g., 'Expert', 'Intermediate', 'Beginner'). Optional for soft skills.",
    )
    importance: Optional[str] = Field(
        None,
        description="Importance of the skill (e.g., 'Critical', 'Important', 'Nice to have')",
    )


class ATSKeyword(BaseModel):
    """
    Mot-clé normalisé issu de l'offre, dédié au Score ATS déterministe.
    Forme alignée sur le contrat (openapi.yaml#/components/schemas/ATSKeyword).
    """

    name: str = Field(..., max_length=MAX_NAME_LEN, description="Nom du mot-clé")
    category: Literal["hard_skill", "soft_skill", "requirement"] = Field(
        ..., description="Compétence technique, comportementale, ou exigence"
    )
    importance: Optional[Literal["Critical", "Important", "Nice to have"]] = Field(
        None, description="Importance du mot-clé dans l'offre"
    )
    aliases: List[str] = Field(
        default_factory=list,
        max_length=MAX_ALIASES,
        description="Variantes/synonymes reconnus au matching (ex. « JS » pour « JavaScript »)",
    )


class AnalysisResult(BaseModel):
    """
    Structured result from job offer analysis
    """

    hard_skills: List[SkillItem] = Field(
        default_factory=list,
        description="Technical skills required (programming languages, tools, frameworks)",
    )
    soft_skills: List[SkillItem] = Field(
        default_factory=list,
        description="Soft skills required (communication, leadership, etc.). Level is optional for soft skills.",
    )
    seniority_level: str = Field(
        ...,
        description="Job seniority level (e.g., 'Junior', 'Mid-level', 'Senior', 'Lead')",
    )
    key_responsibilities: List[str] = Field(
        default_factory=list, description="Main responsibilities and tasks"
    )
    tone: str = Field(
        ...,
        description="Overall tone of the job offer (e.g., 'formal', 'casual', 'innovative')",
    )
    keywords: List[ATSKeyword] = Field(
        default_factory=list,
        max_length=MAX_KEYWORDS,
        description="Mots-clés normalisés pour le Score ATS déterministe (sans doublon)",
    )

    @field_validator("keywords", mode="before")
    @classmethod
    def _coerce_keywords(cls, value):
        # Ceinture post-LLM : normalise / filtre / déduplique / borne avant
        # validation du schéma (un contenu hors enum est écarté, pas une 422).
        return coerce_keywords(value)

    class Config:
        json_schema_extra = {
            "example": {
                "hard_skills": [
                    {"name": "Python", "level": "Expert", "importance": "Critical"},
                    {
                        "name": "FastAPI",
                        "level": "Intermediate",
                        "importance": "Important",
                    },
                    {
                        "name": "Docker",
                        "level": "Intermediate",
                        "importance": "Nice to have",
                    },
                ],
                "soft_skills": [
                    {"name": "Team collaboration", "importance": "Critical"},
                    {"name": "Problem-solving", "importance": "Important"},
                    {"name": "Continuous learning", "importance": "Nice to have"},
                ],
                "seniority_level": "Senior",
                "key_responsibilities": [
                    "Design and implement microservices",
                    "Mentor junior developers",
                    "Participate in architecture decisions",
                ],
                "tone": "innovative",
            }
        }


class HealthResponse(BaseModel):
    """
    Health check response
    """

    status: str = Field(..., description="Service status")
    service: str = Field(..., description="Service name")
    version: str = Field(..., description="Service version")


class ErrorResponse(BaseModel):
    """
    Error response model
    """

    detail: str = Field(..., description="Error message")
