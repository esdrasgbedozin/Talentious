"""
Tests for the main FastAPI application.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    """Test the health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "environment" in data


def test_root():
    """Test the root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
