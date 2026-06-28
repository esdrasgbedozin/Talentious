"""
Pytest configuration and fixtures for testing.
"""
import pytest
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.main import app
from app.database import get_db, Base
from app.models.user import User, UserRole
from app.services.auth import hash_password



# Test database URL (configurable via environment variable)
import os
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://talentious:talentious@db/talentious_test"
)


# Remove session event_loop fixture for compatibility with pytest-asyncio>=0.23
# pytest-asyncio now manages the event loop automatically


@pytest.fixture(scope="function")
async def test_db_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=NullPool,
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    # Cleanup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture(scope="function")
async def test_db(test_db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session = async_sessionmaker(
        test_db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    
    async with async_session() as session:
        yield session


@pytest.fixture(scope="function")
async def client(test_db) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client with database override."""
    async def override_get_db():
        yield test_db
    
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(test_db: AsyncSession) -> User:
    """Create a test user in the database."""
    from app.models.user_profile import UserProfile
    from app.schemas.profile import PersonalInfo, ProfileData, Skills
    
    user = User(
        email="testuser@example.com",
        hashed_password=hash_password("TestPassword123!"),
        role=UserRole.USER
    )
    test_db.add(user)
    await test_db.flush()
    
    # Create profile for user with new schema structure
    empty_profile_data = ProfileData(
        personal_info=PersonalInfo(
            first_name="Test",
            last_name="User",
            email="testuser@example.com",
            phone=None,
            linkedin=None,
            address=None,
            city=None,
            postal_code=None,
            country="France"
        ),
        summary="",  # Empty string, not None
        experiences=[],
        educations=[],
        skills=Skills(hard=[], soft=[]),  # New structure: object with hard/soft lists
        projects=[],
        certifications=[]
    )
    
    profile = UserProfile(
        user_id=user.id,
        profile_data=empty_profile_data.model_dump(mode='json')
    )
    test_db.add(profile)
    await test_db.commit()
    await test_db.refresh(user)
    
    return user


@pytest.fixture
async def auth_headers(client: AsyncClient, test_user: User) -> dict:
    """Get authentication headers for a test user."""
    response = await client.post(
        "/auth/login",
        data={
            "username": test_user.email,
            "password": "TestPassword123!"
        }
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
