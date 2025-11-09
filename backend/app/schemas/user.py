"""
Pydantic schemas for user authentication and authorization.
"""
from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from app.models.user import UserRole


class UserCreate(BaseModel):
    """Schema for user registration."""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (min 8 characters)")


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class UserResponse(BaseModel):
    """Schema for user data in responses."""
    id: UUID = Field(..., description="User unique identifier")
    email: EmailStr = Field(..., description="User email address")
    role: UserRole = Field(..., description="User role")
    created_at: datetime = Field(..., description="Account creation timestamp")
    
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")


class TokenData(BaseModel):
    """Schema for JWT token payload data."""
    user_id: str = Field(..., description="User ID from token")
    email: Optional[str] = Field(None, description="User email from token")
