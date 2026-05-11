from fastapi.testclient import TestClient
from solution import app

client = TestClient(app)


def test_search_basic():
    r = client.get("/users/search?q=alice")
    assert r.status_code == 200
    assert any(u["name"].lower().startswith("alice") for u in r.json())


def test_search_case_insensitive():
    r = client.get("/users/search?q=ALICE")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_empty_query_returns_all():
    r = client.get("/users/search?q=")
    assert r.status_code == 200
    assert len(r.json()) >= 5


def test_no_password_hash_leaked():
    r = client.get("/users/search?q=")
    for user in r.json():
        assert "password_hash" not in user
