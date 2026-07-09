"""
Configuration module for the Talentious application.
"""

import os
from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from functools import lru_cache
from typing import Annotated, Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "Talentious API"
    environment: str = "development"
    debug: bool = True

    # Database
    # Use asyncpg dialect by default for async SQLAlchemy engine
    database_url: str = "postgresql+asyncpg://talentious:talentious@db:5432/talentious"
    # Echo SQL statements (disable in production)
    sql_echo: bool = False

    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # CORS
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value):
        """Accept either a JSON array or a comma-separated string (the .env.example format)."""
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                return value
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value

    # GCP
    gcp_project_id: str = "talentious-project"
    gcp_sql_connection_name: str = "talentious-project:europe-west9:talentious-db-prod"
    gcp_bucket_name: str = "talentious-project-cvs"

    # Stripe (for future payment integration)
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance for convenience
settings = get_settings()
