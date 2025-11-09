# Backend Tests

This directory contains automated tests for the Talentious backend API.

## Test Structure

- **`conftest.py`**: Pytest configuration and shared fixtures
- **`test_auth.py`**: Authentication endpoint tests (register, login, /auth/me)
- **`test_profile.py`**: Profile management endpoint tests (GET, PUT /profile)
- **`test_main.py`**: General API tests (health check, root endpoint)

## Running Tests

### Local Development (with Docker)

```bash
# Create test database (first time only)
docker exec talentious_db psql -U talentious -c "CREATE DATABASE talentious_test;"

# Run all tests
docker exec talentious_backend pytest tests/ -v

# Run specific test file
docker exec talentious_backend pytest tests/test_auth.py -v

# Run specific test class
docker exec talentious_backend pytest tests/test_auth.py::TestAuthRegister -v

# Run with coverage
docker exec talentious_backend pytest tests/ --cov=app --cov-report=term-missing
```

### CI/CD Pipeline

Tests are automatically run in GitHub Actions on every push to the `develop` branch. The workflow:
1. Sets up PostgreSQL service container
2. Installs Python 3.11 and dependencies
3. Runs all tests with pytest
4. Only proceeds to build/deploy if all tests pass

## Test Coverage

### Authentication Tests (test_auth.py)
- ✅ User registration with valid data
- ✅ Duplicate email detection
- ✅ Email validation
- ✅ Password strength validation
- ✅ Successful login
- ✅ Wrong password handling
- ✅ Non-existent user handling
- ✅ Missing credentials validation
- ✅ Authenticated /auth/me access
- ✅ Unauthenticated access rejection
- ✅ Invalid token detection
- ✅ Malformed authorization header handling

### Profile Tests (test_profile.py)
- ✅ Get profile with authentication
- ✅ Get profile without authentication (401)
- ✅ Get profile with invalid token (401)
- ✅ Update profile with complete data
- ✅ Update profile with minimal data
- ✅ Update profile without authentication (401)
- ✅ Invalid data structure validation (422)
- ✅ Invalid date format validation (422)
- ✅ Update persistence verification

### General API Tests (test_main.py)
- ✅ Health check endpoint
- ✅ Root endpoint

## Test Database

Tests use a separate PostgreSQL database (`talentious_test`) to avoid interfering with development data. The database is automatically created and torn down for each test function using pytest fixtures.

## Fixtures

### `test_db`
Provides a clean database session for each test.

### `client`
Provides an async HTTP client for making API requests.

### `test_user`
Creates a test user with a complete profile for authentication tests.

### `auth_headers`
Provides authentication headers with a valid JWT token for protected endpoints.

## Adding New Tests

1. Create a new test file following the naming pattern `test_*.py`
2. Use the provided fixtures for database and authentication
3. Follow the existing test structure with classes and descriptive method names
4. Run tests locally before committing

Example:
```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
class TestMyFeature:
    async def test_my_endpoint(self, client: AsyncClient, auth_headers):
        response = await client.get("/my-endpoint", headers=auth_headers)
        assert response.status_code == 200
```

## Current Test Results

**23/23 tests passing** ✅

All authentication and profile management endpoints are fully tested and validated.
