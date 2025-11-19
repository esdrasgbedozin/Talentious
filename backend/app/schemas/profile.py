"""
Pydantic schemas for user career profile data.
IMPORTANT: These schemas MUST match frontend TypeScript interfaces exactly.
Frontend: frontend/src/types/profile.ts
"""
from datetime import datetime
from uuid import UUID
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class PersonalInfo(BaseModel):
    """Personal information schema - matches frontend PersonalInfo interface."""
    first_name: str = Field(..., description="First name")
    last_name: str = Field(..., description="Last name")
    email: str = Field(..., description="Email address")
    phone: Optional[str] = Field(None, description="Phone number")
    linkedin: Optional[str] = Field(None, description="LinkedIn profile URL")
    address: Optional[str] = Field(None, description="Full address")
    city: Optional[str] = Field(None, description="City")
    postal_code: Optional[str] = Field(None, description="Postal code")
    country: Optional[str] = Field(None, description="Country")


class Experience(BaseModel):
    """Work experience schema - matches frontend Experience interface."""
    id: str = Field(..., description="Experience unique identifier")
    title: str = Field(..., description="Job title")
    company: str = Field(..., description="Company name")
    location: Optional[str] = Field(None, description="Job location")
    start_date: str = Field(..., description="Start date (format: YYYY-MM)")
    end_date: Optional[str] = Field(None, description="End date (format: YYYY-MM or null if current)")
    is_current: bool = Field(False, description="Whether this is the current position")
    description: str = Field(..., description="Job description and achievements")
    achievements: Optional[List[str]] = Field(None, description="List of achievements")


class Education(BaseModel):
    """Education schema - matches frontend Education interface."""
    id: str = Field(..., description="Education unique identifier")
    degree: str = Field(..., description="Degree or certification name")
    institution: str = Field(..., description="School or institution name")
    location: Optional[str] = Field(None, description="Institution location")
    start_date: str = Field(..., description="Start date (format: YYYY-MM)")
    end_date: Optional[str] = Field(None, description="End date (format: YYYY-MM)")
    field_of_study: Optional[str] = Field(None, description="Field of study")
    description: Optional[str] = Field(None, description="Additional details")
    grade: Optional[str] = Field(None, description="Grade or GPA")


class Skills(BaseModel):
    """Skills schema - matches frontend Skills interface."""
    hard: List[str] = Field(default_factory=list, description="Technical/hard skills (max 20)")
    soft: List[str] = Field(default_factory=list, description="Soft skills (max 20)")


class Project(BaseModel):
    """Project schema - matches frontend Project interface."""
    id: str = Field(..., description="Project unique identifier")
    name: str = Field(..., description="Project name")
    description: str = Field(..., description="Project description")
    url: Optional[str] = Field(None, description="Project URL or repository")
    start_date: Optional[str] = Field(None, description="Start date (format: YYYY-MM)")
    end_date: Optional[str] = Field(None, description="End date (format: YYYY-MM)")
    technologies: Optional[List[str]] = Field(None, description="Technologies used")
    role: Optional[str] = Field(None, description="Role in project")


class Certification(BaseModel):
    """Certification schema - matches frontend Certification interface."""
    id: str = Field(..., description="Certification unique identifier")
    name: str = Field(..., description="Certification name")
    issuing_organization: str = Field(..., description="Issuing organization")
    issue_date: Optional[str] = Field(None, description="Issue date (format: YYYY-MM)")
    expiration_date: Optional[str] = Field(None, description="Expiration date (format: YYYY-MM or null for no expiration)")
    credential_id: Optional[str] = Field(None, description="Credential ID")
    credential_url: Optional[str] = Field(None, description="Credential URL")


class ProfileData(BaseModel):
    """Complete profile data schema - matches frontend UserProfile interface."""
    personal_info: PersonalInfo = Field(..., description="Personal information")
    summary: str = Field(default="", description="Professional summary")
    experiences: List[Experience] = Field(default_factory=list, description="Work experiences")
    educations: List[Education] = Field(default_factory=list, description="Education history")
    skills: Skills = Field(default_factory=Skills, description="Hard and soft skills")
    projects: List[Project] = Field(default_factory=list, description="Projects list")
    certifications: List[Certification] = Field(default_factory=list, description="Certifications list")


class ProfileResponse(BaseModel):
    """Schema for profile data in responses."""
    user_id: UUID = Field(..., description="User unique identifier")
    profile_data: ProfileData = Field(..., description="Complete profile data")
    updated_at: datetime = Field(..., description="Last update timestamp")
    
    model_config = ConfigDict(from_attributes=True)


class ProfileUpdate(BaseModel):
    """Schema for updating profile data."""
    profile_data: ProfileData = Field(..., description="Complete profile data to update")
