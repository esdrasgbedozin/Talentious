"""
Tests for authentication endpoints.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestAuthRegister:
    """Test cases for /auth/register endpoint."""
    
    async def test_register_success(self, client: AsyncClient):
        """Test successful user registration."""
        response = await client.post(
            "/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "SecurePassword123!"
            }
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["role"] == "user"
        assert "id" in data
        assert "created_at" in data
        assert "hashed_password" not in data  # Password should not be in response
    
    async def test_register_duplicate_email(self, client: AsyncClient, test_user):
        """Test registration with existing email."""
        response = await client.post(
            "/auth/register",
            json={
                "email": test_user.email,
                "password": "AnotherPassword123!"
            }
        )
        
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()
    
    async def test_register_invalid_email(self, client: AsyncClient):
        """Test registration with invalid email format."""
        response = await client.post(
            "/auth/register",
            json={
                "email": "not-an-email",
                "password": "SecurePassword123!"
            }
        )
        
        assert response.status_code == 422  # Validation error
    
    async def test_register_weak_password(self, client: AsyncClient):
        """Test registration with weak password."""
        response = await client.post(
            "/auth/register",
            json={
                "email": "newuser2@example.com",
                "password": "weak"
            }
        )
        
        assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
class TestAuthLogin:
    """Test cases for /auth/login endpoint."""
    
    async def test_login_success(self, client: AsyncClient, test_user):
        """Test successful login."""
        response = await client.post(
            "/auth/login",
            data={
                "username": test_user.email,
                "password": "TestPassword123!"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert len(data["access_token"]) > 0
    
    async def test_login_wrong_password(self, client: AsyncClient, test_user):
        """Test login with incorrect password."""
        response = await client.post(
            "/auth/login",
            data={
                "username": test_user.email,
                "password": "WrongPassword123!"
            }
        )
        
        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()
    
    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Test login with non-existent email."""
        response = await client.post(
            "/auth/login",
            data={
                "username": "nonexistent@example.com",
                "password": "SomePassword123!"
            }
        )
        
        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()
    
    async def test_login_missing_credentials(self, client: AsyncClient):
        """Test login with missing credentials."""
        response = await client.post("/auth/login", data={})
        
        assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
class TestAuthMe:
    """Test cases for /auth/me endpoint."""
    
    async def test_me_authenticated(self, client: AsyncClient, auth_headers, test_user):
        """Test /auth/me with valid token."""
        response = await client.get("/auth/me", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user.email
        assert data["id"] == str(test_user.id)
        assert data["role"] == test_user.role.value
    
    async def test_me_no_token(self, client: AsyncClient):
        """Test /auth/me without authentication token."""
        response = await client.get("/auth/me")
        
        assert response.status_code == 401
        assert "not authenticated" in response.json()["detail"].lower()
    
    async def test_me_invalid_token(self, client: AsyncClient):
        """Test /auth/me with invalid token."""
        response = await client.get(
            "/auth/me",
            headers={"Authorization": "Bearer invalid_token_here"}
        )
        
        assert response.status_code == 401
        assert "credentials" in response.json()["detail"].lower()
    
    async def test_me_malformed_header(self, client: AsyncClient):
        """Test /auth/me with malformed authorization header."""
        response = await client.get(
            "/auth/me",
            headers={"Authorization": "NotBearer token"}
        )
        
        assert response.status_code == 401
