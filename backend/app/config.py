"""
Configuration module for the Talentious application.
"""

import os
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from functools import lru_cache
from typing import Annotated, Optional

# Known-insecure default; forbidden outside local development.
DEFAULT_SECRET_KEY = "your-secret-key-change-in-production"


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
    secret_key: str = DEFAULT_SECRET_KEY
    algorithm: str = "HS256"
    # Access token is short-lived and stateless; the session is kept alive by a
    # long-lived, rotating, DB-backed refresh token (revocable — see RefreshToken).
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    # httpOnly cookie carrying the refresh token. Secure is forced in production;
    # SameSite=Lax works for same-site setups (localhost:3000↔:8000, app↔api subdomains).
    refresh_cookie_name: str = "talentious_refresh"
    # Email verification / password reset link lifetime.
    email_token_expire_hours: int = 24

    # Transactional email (Brevo). Disabled by default: without a key, emails are
    # logged, not sent (dev/test/CI). See docs/adr/ADR-EMAIL.md.
    email_enabled: bool = False
    brevo_api_key: str = ""
    email_sender_address: str = "noreply@talentious.local"
    email_sender_name: str = "Talentious"
    # Public base URL of the frontend, used to build links inside emails.
    frontend_base_url: str = "http://localhost:3000"

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

    # Stripe (test-mode keys locally; live keys in prod — same code, see ADR-MODEL)
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    stripe_price_30_days: Optional[str] = None  # Stripe Price ID for the 30-day pass
    stripe_price_90_days: Optional[str] = None  # Stripe Price ID for the 90-day pass

    # Public base URL of the frontend (for Checkout success/cancel redirects)
    app_base_url: str = "http://localhost:3000"

    # Rate limiting (in-memory / single-instance; use a shared store for multi-instance prod).
    rate_limit_enabled: bool = True
    login_rate_limit: str = "5/minute"

    @model_validator(mode="after")
    def _enforce_production_safety(self):
        """Refuse insecure defaults outside local development, and never run debug in prod."""
        if self.environment.lower() != "development":
            if self.secret_key == DEFAULT_SECRET_KEY:
                raise ValueError(
                    "SECRET_KEY must be set to a strong secret when ENVIRONMENT is not 'development'."
                )
            # Force debug off outside dev so 500s never render stack traces.
            self.debug = False
        return self

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
