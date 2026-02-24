"""
Ryzm Terminal — API Tests
#1 Test Suite — Core API endpoints
"""
import pytest


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200


def test_home_page(client):
    resp = client.get("/")
    assert resp.status_code == 200


def test_app_page(client):
    resp = client.get("/app")
    assert resp.status_code == 200


def test_market_data(client):
    resp = client.get("/api/market")
    assert resp.status_code == 200


def test_news(client):
    resp = client.get("/api/news")
    assert resp.status_code == 200


def test_fear_greed(client):
    resp = client.get("/api/fear-greed")
    assert resp.status_code == 200


def test_admin_unauthorized(client):
    resp = client.get("/api/admin/stats")
    assert resp.status_code in (401, 503)


def test_admin_authorized(client, admin_headers):
    resp = client.get("/api/admin/stats", headers=admin_headers)
    assert resp.status_code == 200


def test_notifications(client, auth_headers):
    resp = client.get("/api/notifications", headers=auth_headers)
    assert resp.status_code == 200


def test_council_history(client):
    resp = client.get("/api/council/history?limit=5")
    assert resp.status_code == 200


def test_payment_status_unauthenticated(client):
    resp = client.get("/api/payments/status")
    assert resp.status_code == 401


def test_metrics_unauthorized(client):
    resp = client.get("/metrics")
    assert resp.status_code == 403


def test_telegram_status(client):
    resp = client.get("/api/telegram/status")
    assert resp.status_code == 200
