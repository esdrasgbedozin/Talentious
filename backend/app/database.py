"""
Database configuration and session management.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.config import settings

# Use settings for database URL and echo configuration
DATABASE_URL = settings.database_url


# Base for SQLAlchemy models (defined first for Alembic import)
Base = declarative_base()

# Create the async engine only if asyncpg is in the URL
if "asyncpg" in DATABASE_URL:
    engine = create_async_engine(
        DATABASE_URL,
        echo=bool(settings.sql_echo),  # Configurable SQL echo
        future=True,
        pool_pre_ping=True,  # Check connection before use
    )

    # Create a session factory
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
else:
    engine = None
    AsyncSessionLocal = None


# FastAPI dependency for obtaining a database session
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency to inject a database session into FastAPI routes.

    Usage:
        @app.get("/users")
        async def get_users(db: AsyncSession = Depends(get_db)):
            ...
    """
    if AsyncSessionLocal is None:
        raise RuntimeError("Database engine not initialized for async operations")

    # Yield the session to the caller and let the caller manage commits.
    # Automatically rolling back on exceptions so callers don't leave transactions open.
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


def get_session_factory():
    """Return the session factory for background workers (own session, not the request's).

    Overridable in tests to bind the worker to the test database engine.
    """
    if AsyncSessionLocal is None:
        raise RuntimeError("Database engine not initialized for async operations")
    return AsyncSessionLocal
