"""
Ryzm Terminal — Test Configuration
#1 Test Suite Foundation
"""
import os
import pytest

# Set test env before any app imports
os.environ["APP_ENV"] = "test"
os.environ["JWT_SECRET"] = "test-secret-key-for-testing-only"
os.environ["ADMIN_TOKEN"] = "test-admin-token"
os.environ["GENAI_API_KEY"] = "test-key"

from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    """Create test client with isolated DB."""
    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers(client):
    """Register + login a test user, return auth headers."""
    import time
    email = f"test_{int(time.time())}@test.com"
    client.post("/api/auth/register", json={
        "email": email,
        "password": "TestPass123!",
        "display_name": "Test User",
        "accept_tos": True,
    })
    resp = client.post("/api/auth/login", json={
        "email": email,
        "password": "TestPass123!",
    })
    token = resp.json().get("token", "")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers():
    return {"X-Admin-Token": "test-admin-token"}
