"""
Pydantic models for CV Generator API request/response validation
"""

from typing import List, Optional
from datetime import date
from pydantic import BaseModel, Field


# ==================== INPUT MODELS ====================

class SkillItem(BaseModel):
    """Individual skill item from offer analysis"""
    name: str = Field(..., description="Skill name")
    level: Optional[str] = Field(None, description="Required level (e.g., 'Expert', 'Intermediate')")
    importance: Optional[str] = Field(None, description="Importance level (Critical, Important, Nice to have)")


class OfferAnalysis(BaseModel):
    """
    Job offer analysis result from Analyseur-Offre agent (v0.2.0)
    """
    hard_skills: List[SkillItem] = Field(..., description="Technical skills required")
    soft_skills: List[SkillItem] = Field(..., description="Soft/interpersonal skills required")
    seniority_level: str = Field(..., description="Required seniority level (Junior, Mid-level, Senior, Expert)")
    key_responsibilities: List[str] = Field(..., description="Main responsibilities of the position")
    tone: str = Field(..., description="Tone of the job offer (professional, casual, innovative)")


class PersonalInfo(BaseModel):
    """Personal information from user profile"""
    first_name: str
    last_name: str
    phone: Optional[str] = None
    email: str
    linkedin: Optional[str] = None
    address: Optional[str] = None


class Experience(BaseModel):
    """Work experience entry"""
    id: str
    title: str
    company: str
    start_date: str  # YYYY-MM format
    end_date: Optional[str] = None  # YYYY-MM format or null for current
    description: str
    location: Optional[str] = None


class Education(BaseModel):
    """Education entry"""
    id: str
    degree: str
    institution: str
    graduation_date: str  # YYYY-MM format
    description: Optional[str] = None


class Skill(BaseModel):
    """User skill from profile"""
    id: Optional[str] = None  # Optional ID field
    name: str
    category: Optional[str] = None  # "hard_skill" or "soft_skill"
    level: Optional[str] = None


class Project(BaseModel):
    """Project entry"""
    id: str
    name: str
    description: str
    url: Optional[str] = None
    completion_date: Optional[str] = None  # YYYY-MM format


class Certification(BaseModel):
    """Certification entry"""
    id: str
    name: str
    issuer: str
    issue_date: str  # YYYY-MM format
    url: Optional[str] = None


class UserProfileData(BaseModel):
    """
    Complete user profile data from backend
    """
    personal_info: PersonalInfo
    summary: Optional[str] = None
    experiences: List[Experience] = []
    educations: List[Education] = []
    skills: List[Skill] = []
    projects: List[Project] = []
    certifications: List[Certification] = []


class GenerateRequest(BaseModel):
    """
    Request model for CV generation
    Combines offer analysis with user profile data
    """
    offer_analysis: OfferAnalysis = Field(..., description="Job offer analysis from Analyseur-Offre agent")
    user_profile: UserProfileData = Field(..., description="User's complete profile data")


# ==================== OUTPUT MODELS ====================

class SelectedExperience(BaseModel):
    """
    Optimized work experience for the target job offer
    """
    id: str = Field(..., description="Original experience ID")
    title: str = Field(..., description="Job title")
    company: str = Field(..., description="Company name")
    start_date: str = Field(..., description="Start date (YYYY-MM)")
    end_date: Optional[str] = Field(None, description="End date (YYYY-MM) or null for current")
    location: Optional[str] = Field(None, description="Location")
    description: str = Field(
        ..., 
        description="Rewritten description optimized for the target job offer with action verbs, metrics, and keywords"
    )
    highlighted_skills: List[str] = Field(
        ..., 
        description="Skills demonstrated in this experience that match the job offer"
    )


class HighlightedSkill(BaseModel):
    """
    Skill prioritized for the target job offer
    """
    name: str = Field(..., description="Skill name")
    level: Optional[str] = Field(None, description="Proficiency level")
    category: str = Field(..., description="Skill category (hard_skill or soft_skill)")
    importance: str = Field(..., description="Importance for target job (Critical, Important, Nice to have)")


class SelectedEducation(BaseModel):
    """
    Education entry relevant for the target job
    """
    id: str
    degree: str
    institution: str
    graduation_date: str
    description: Optional[str] = None


class SelectedProject(BaseModel):
    """
    Project relevant for the target job
    """
    id: str
    name: str
    description: str
    url: Optional[str] = None
    completion_date: Optional[str] = None
    relevant_skills: List[str] = Field(
        ..., 
        description="Skills demonstrated that match the job offer"
    )


class SelectedCertification(BaseModel):
    """
    Certification relevant for the target job
    """
    id: str
    name: str
    issuer: str
    issue_date: str
    url: Optional[str] = None


class GeneratedCVData(BaseModel):
    """
    Complete optimized CV structure ready for frontend rendering
    This is the final output of the Rédacteur-CV agent
    """
    personal_info: PersonalInfo = Field(..., description="Personal information (unchanged from profile)")
    
    summary: str = Field(
        ..., 
        description="Rewritten professional summary targeting the specific job offer (2-4 sentences, 50-120 words)"
    )
    
    selected_experiences: List[SelectedExperience] = Field(
        ..., 
        description="Work experiences selected and optimized for the target job (3-5 most relevant)"
    )
    
    highlighted_skills: List[HighlightedSkill] = Field(
        ..., 
        description="Skills prioritized and categorized for the target job (8-15 skills)"
    )
    
    selected_educations: List[SelectedEducation] = Field(
        ..., 
        description="Education entries relevant for the target job"
    )
    
    selected_projects: List[SelectedProject] = Field(
        default_factory=list,
        description="Projects relevant for the target job (optional, 0-3 projects)"
    )
    
    selected_certifications: List[SelectedCertification] = Field(
        default_factory=list,
        description="Certifications relevant for the target job (optional, 0-5 certifications)"
    )
    
    optimization_notes: Optional[str] = Field(
        None,
        description="Internal notes about optimization strategy (for debugging, optional)"
    )


class GenerateResponse(BaseModel):
    """
    Response model for CV generation endpoint
    """
    cv_data: GeneratedCVData = Field(..., description="Generated and optimized CV data")
    message: str = Field(default="CV generated successfully", description="Status message")
