"""
Pydantic schemas for user career profile data.
"""
from datetime import datetime, date
from uuid import UUID
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class PersonalInfo(BaseModel):
    """Personal information schema."""
    first_name: str = Field(..., description="First name")
    last_name: str = Field(..., description="Last name")
    phone: Optional[str] = Field(None, description="Phone number")
    email: str = Field(..., description="Email address")
    linkedin: Optional[str] = Field(None, description="LinkedIn profile URL")
    address: Optional[str] = Field(None, description="Full address")


class Experience(BaseModel):
    """Work experience schema."""
    id: Optional[str] = Field(None, description="Experience unique identifier")
    title: str = Field(..., description="Job title")
    company: str = Field(..., description="Company name")
    start_date: date = Field(..., description="Start date")
    end_date: Optional[date] = Field(None, description="End date (null if current)")
    description: str = Field(..., description="Job description and achievements")
    location: Optional[str] = Field(None, description="Job location")


class Education(BaseModel):
    """Education schema."""
    id: Optional[str] = Field(None, description="Education unique identifier")
    degree: str = Field(..., description="Degree or certification name")
    institution: str = Field(..., description="School or institution name")
    graduation_date: date = Field(..., description="Graduation date or completion date")
    description: Optional[str] = Field(None, description="Additional details")


class Skill(BaseModel):
    """Skill schema."""
    name: str = Field(..., description="Skill name")
    level: Optional[str] = Field(None, description="Skill level (beginner, intermediate, expert)")


class Project(BaseModel):
    """Project schema."""
    id: Optional[str] = Field(None, description="Project unique identifier")
    name: str = Field(..., description="Project name")
    description: str = Field(..., description="Project description")
    url: Optional[str] = Field(None, description="Project URL or repository")
    completion_date: Optional[date] = Field(None, description="Project completion date")


class Certification(BaseModel):
    """Certification schema."""
    id: Optional[str] = Field(None, description="Certification unique identifier")
    name: str = Field(..., description="Certification name")
    issuer: str = Field(..., description="Issuing organization")
    issue_date: date = Field(..., description="Certification date")
    url: Optional[str] = Field(None, description="Credential URL")


class ProfileData(BaseModel):
    """Complete profile data schema."""
    personal_info: PersonalInfo = Field(..., description="Personal information")
    summary: Optional[str] = Field(None, description="Professional summary")
    experiences: List[Experience] = Field(default_factory=list, description="Work experiences")
    educations: List[Education] = Field(default_factory=list, description="Education history")
    skills: List[Skill] = Field(default_factory=list, description="Skills list")
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
