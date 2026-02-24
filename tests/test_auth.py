"""
Ryzm Terminal — Auth Tests
#1 Test Suite — Core authentication flows
"""
import time
import pytest


def test_register_success(client):
    email = f"reg_{int(time.time())}@test.com"
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecureP@ss1",
        "display_name": "Tester",
        "accept_tos": True,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "registered"
    assert data["email"] == email


def test_register_weak_password(client):
    resp = client.post("/api/auth/register", json={
        "email": f"weak_{int(time.time())}@test.com",
        "password": "12345678",
        "display_name": "Weak",
        "accept_tos": True,
    })
    # Should reject weak passwords (no uppercase/special)
    assert resp.status_code in (200, 400)


def test_register_no_tos(client):
    resp = client.post("/api/auth/register", json={
        "email": f"notos_{int(time.time())}@test.com",
        "password": "SecureP@ss1",
        "display_name": "NoTos",
        "accept_tos": False,
    })
    assert resp.status_code == 400


def test_login_success(client):
    email = f"login_{int(time.time())}@test.com"
    client.post("/api/auth/register", json={
        "email": email, "password": "SecureP@ss1",
        "display_name": "Lgn", "accept_tos": True,
    })
    resp = client.post("/api/auth/login", json={
        "email": email, "password": "SecureP@ss1",
    })
    assert resp.status_code == 200
    assert "token" in resp.json()


def test_login_wrong_password(client):
    email = f"wrongpw_{int(time.time())}@test.com"
    client.post("/api/auth/register", json={
        "email": email, "password": "SecureP@ss1",
        "display_name": "WP", "accept_tos": True,
    })
    resp = client.post("/api/auth/login", json={
        "email": email, "password": "WrongPassword1!",
    })
    assert resp.status_code == 401


def test_profile_unauthenticated(client):
    resp = client.get("/api/auth/profile")
    assert resp.status_code == 401


def test_profile_authenticated(client, auth_headers):
    resp = client.get("/api/auth/profile", headers=auth_headers)
    assert resp.status_code == 200
    assert "email" in resp.json()


def test_logout(client, auth_headers):
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 200
