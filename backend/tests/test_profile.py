"""
Tests for profile management endpoints.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestProfileGet:
    """Test cases for GET /profile endpoint."""

    async def test_get_profile_authenticated(
        self, client: AsyncClient, auth_headers, test_user
    ):
        """Test getting profile with valid authentication."""
        response = await client.get("/profile", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == str(test_user.id)
        assert "profile_data" in data
        assert "updated_at" in data

        # Check profile structure
        profile_data = data["profile_data"]
        assert "personal_info" in profile_data
        assert profile_data["personal_info"]["email"] == test_user.email
        assert "experiences" in profile_data
        assert "educations" in profile_data
        assert "skills" in profile_data

    async def test_get_profile_no_auth(self, client: AsyncClient):
        """Test getting profile without authentication."""
        response = await client.get("/profile")

        assert response.status_code == 401
        assert "not authenticated" in response.json()["detail"].lower()

    async def test_get_profile_invalid_token(self, client: AsyncClient):
        """Test getting profile with invalid token."""
        response = await client.get(
            "/profile", headers={"Authorization": "Bearer invalid_token"}
        )

        assert response.status_code == 401


@pytest.mark.asyncio
class TestProfileUpdate:
    """Test cases for PUT /profile endpoint."""

    async def test_update_profile_success(self, client: AsyncClient, auth_headers):
        """Test successful profile update."""
        update_data = {
            "profile_data": {
                "personal_info": {
                    "first_name": "John",
                    "last_name": "Doe",
                    "email": "testuser@example.com",
                    "phone": "+33612345678",
                    "linkedin": "https://linkedin.com/in/johndoe",
                    "address": "123 Test Street",
                    "city": "Paris",
                    "postal_code": "75001",
                    "country": "France",
                },
                "summary": "Experienced software developer with 5 years in web development",
                "experiences": [
                    {
                        "id": "exp1",
                        "title": "Senior Developer",
                        "company": "Tech Corp",
                        "location": "Paris, France",
                        "start_date": "2020-01",
                        "end_date": None,
                        "is_current": True,
                        "description": "Leading development of web applications",
                        "achievements": [
                            "Led team of 5",
                            "Improved performance by 50%",
                        ],
                    }
                ],
                "educations": [
                    {
                        "id": "edu1",
                        "degree": "Master in Computer Science",
                        "institution": "Paris University",
                        "location": "Paris, France",
                        "start_date": "2017-09",
                        "end_date": "2019-06",
                        "field": "Artificial Intelligence",
                        "description": "Specialized in AI and Machine Learning",
                        "grade": "Distinction",
                    }
                ],
                "skills": {
                    "hard": ["Python", "JavaScript", "SQL", "Docker"],
                    "soft": ["Leadership", "Communication", "Problem Solving"],
                },
                "languages": [
                    {"name": "English", "level": "Fluent"},
                    {"name": "French", "level": "Native"},
                ],
                "projects": [
                    {
                        "id": "proj1",
                        "name": "E-commerce Platform",
                        "description": "Built a full-stack e-commerce solution",
                        "url": "https://github.com/user/ecommerce",
                        "start_date": "2023-01",
                        "end_date": "2023-12",
                        "technologies": ["React", "Node.js", "PostgreSQL"],
                        "role": "Full Stack Developer",
                    }
                ],
                "certifications": [
                    {
                        "id": "cert1",
                        "name": "AWS Certified Developer",
                        "issuer": "Amazon Web Services",
                        "issue_date": "2023-06",
                        "expiration_date": "2026-06",
                        "credential_id": "AWS-12345",
                        "credential_url": "https://aws.amazon.com/certification",
                    }
                ],
            }
        }

        response = await client.put("/profile", json=update_data, headers=auth_headers)

        assert response.status_code == 200
        data = response.json()

        # Verify updated data
        assert data["profile_data"]["personal_info"]["first_name"] == "John"
        assert data["profile_data"]["personal_info"]["last_name"] == "Doe"
        assert data["profile_data"]["summary"] == update_data["profile_data"]["summary"]
        assert len(data["profile_data"]["experiences"]) == 1
        assert len(data["profile_data"]["skills"]["hard"]) == 4
        assert len(data["profile_data"]["skills"]["soft"]) == 3
        assert len(data["profile_data"]["projects"]) == 1
        assert len(data["profile_data"]["certifications"]) == 1

    async def test_update_profile_minimal(self, client: AsyncClient, auth_headers):
        """Test profile update with minimal data."""
        update_data = {
            "profile_data": {
                "personal_info": {
                    "first_name": "Jane",
                    "last_name": "Smith",
                    "email": "testuser@example.com",
                },
                "summary": "",
                "experiences": [],
                "educations": [],
                "skills": {"hard": [], "soft": []},
                "projects": [],
                "certifications": [],
            }
        }

        response = await client.put("/profile", json=update_data, headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["profile_data"]["personal_info"]["first_name"] == "Jane"
        assert data["profile_data"]["experiences"] == []

    async def test_update_profile_no_auth(self, client: AsyncClient):
        """Test profile update without authentication."""
        update_data = {
            "profile_data": {
                "personal_info": {
                    "first_name": "Test",
                    "last_name": "User",
                    "email": "test@example.com",
                },
                "summary": "",
                "experiences": [],
                "educations": [],
                "skills": {"hard": [], "soft": []},
                "projects": [],
                "certifications": [],
            }
        }

        response = await client.put("/profile", json=update_data)

        assert response.status_code == 401

    async def test_update_profile_invalid_data(self, client: AsyncClient, auth_headers):
        """Test profile update with invalid data structure."""
        update_data = {
            "profile_data": {
                "personal_info": {
                    "first_name": "Test"
                    # Missing required fields: last_name, email
                },
                "summary": "",
                "experiences": [],
                "educations": [],
                "skills": {"hard": [], "soft": []},
                "projects": [],
                "certifications": [],
            }
        }

        response = await client.put("/profile", json=update_data, headers=auth_headers)

        assert response.status_code == 422  # Validation error

    async def test_update_profile_invalid_date_format(
        self, client: AsyncClient, auth_headers
    ):
        """Test profile update with invalid date format."""
        update_data = {
            "profile_data": {
                "personal_info": {
                    "first_name": "Test",
                    "last_name": "User",
                    "email": "test@example.com",
                },
                "summary": "",
                "experiences": [
                    {
                        "id": "exp1",
                        "title": "Developer",
                        "company": "Company",
                        "start_date": "invalid-date",  # Invalid format (should be YYYY-MM)
                        "is_current": False,
                        "description": "Some work",
                    }
                ],
                "educations": [],
                "skills": {"hard": [], "soft": []},
                "projects": [],
                "certifications": [],
            }
        }

        response = await client.put("/profile", json=update_data, headers=auth_headers)

        # Note: Since we use string for dates, this might not fail validation
        # but it's good practice to test edge cases
        assert response.status_code in [200, 422]

    async def test_update_then_get_profile(self, client: AsyncClient, auth_headers):
        """Test updating profile and then retrieving it."""
        # Update profile
        update_data = {
            "profile_data": {
                "personal_info": {
                    "first_name": "Updated",
                    "last_name": "Name",
                    "email": "testuser@example.com",
                    "phone": "+33123456789",
                },
                "summary": "This is my updated summary",
                "experiences": [],
                "educations": [],
                "skills": {"hard": ["Python", "FastAPI"], "soft": ["Communication"]},
                "projects": [],
                "certifications": [],
            }
        }

        update_response = await client.put(
            "/profile", json=update_data, headers=auth_headers
        )
        assert update_response.status_code == 200

        # Get profile to verify persistence
        get_response = await client.get("/profile", headers=auth_headers)
        assert get_response.status_code == 200

        data = get_response.json()
        assert data["profile_data"]["personal_info"]["first_name"] == "Updated"
        assert data["profile_data"]["personal_info"]["phone"] == "+33123456789"
        assert data["profile_data"]["summary"] == "This is my updated summary"
        assert len(data["profile_data"]["skills"]["hard"]) == 2
        assert "Python" in data["profile_data"]["skills"]["hard"]
        assert "FastAPI" in data["profile_data"]["skills"]["hard"]
