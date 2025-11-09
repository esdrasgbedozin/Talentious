"""
Database configuration and session management.
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from typing import AsyncGenerator

# Retrieve the database URL from environment variables
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://talentious:talentious@db:5432/talentious")

# Base for SQLAlchemy models (defined first for Alembic import)
Base = declarative_base()

# Create the async engine only if asyncpg is in the URL
if "asyncpg" in DATABASE_URL:
    engine = create_async_engine(
        DATABASE_URL,
        echo=True,  # Log SQL queries (disable in production)
        future=True,
        pool_pre_ping=True,  # Check connection before use
    )

    # Create a session factory
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
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
    
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
