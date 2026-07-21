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
    password: str = Field(
        ..., min_length=8, description="User password (min 8 characters)"
    )


class UserLogin(BaseModel):
    """Schema for user login."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class UserResponse(BaseModel):
    """Schema for user data in responses."""

    id: UUID = Field(..., description="User unique identifier")
    email: EmailStr = Field(..., description="User email address")
    role: UserRole = Field(..., description="User role")
    email_verified: bool = Field(
        default=False, description="Whether the user confirmed their email address"
    )
    display_name: Optional[str] = Field(
        default=None,
        description="Nom d'affichage (prénom du profil), modifiable via /profile",
    )
    created_at: datetime = Field(..., description="Account creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class VerifyEmailRequest(BaseModel):
    """Body of POST /auth/verify-email."""

    token: str = Field(..., description="Email verification token")


class ForgotPasswordRequest(BaseModel):
    """Body of POST /auth/password/forgot."""

    email: EmailStr = Field(..., description="Account email address")


class ResendVerificationRequest(BaseModel):
    """Body of POST /auth/verify-email/resend (public, enumeration-safe)."""

    email: EmailStr = Field(..., description="Account email address")


class ChangePasswordRequest(BaseModel):
    """Body of POST /auth/password/change (authenticated re-auth)."""

    current_password: str = Field(..., description="Current password (re-auth)")
    new_password: str = Field(..., min_length=8, description="New password")


class ChangeEmailRequest(BaseModel):
    """Body of POST /auth/email/change (authenticated re-auth)."""

    new_email: EmailStr = Field(..., description="New email address")
    current_password: str = Field(..., description="Current password (re-auth)")


class ConfirmEmailChangeRequest(BaseModel):
    """Body of POST /auth/email/confirm (public, token from the new mailbox)."""

    token: str = Field(..., description="Email-change confirmation token")


class ResetPasswordRequest(BaseModel):
    """Body of POST /auth/password/reset."""

    token: str = Field(..., description="Password reset token")
    new_password: str = Field(
        ..., min_length=8, description="New password (min 8 characters)"
    )


class Token(BaseModel):
    """Schema for JWT token response."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")


class TokenData(BaseModel):
    """Schema for JWT token payload data."""

    user_id: str = Field(..., description="User ID from token")
    email: Optional[str] = Field(None, description="User email from token")
