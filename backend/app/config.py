"""
Configuration module for the Talentious application.
"""
import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings."""
    
    # Application
    app_name: str = "Talentious API"
    environment: str = "development"
    debug: bool = True
    
    # Database
    database_url: str = "postgresql://talentious:talentious@db:5432/talentious"
    
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # GCP
    gcp_project_id: str = "talentious-project"
    gcp_sql_connection_name: str = "talentious-project:europe-west9:talentious-db-prod"
    gcp_bucket_name: str = "talentious-project-cvs"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
