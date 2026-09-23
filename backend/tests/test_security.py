from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.Domains.Security.adapters.jwt import JwtTokenCodec
from app.Domains.Security.adapters.passwords import Argon2PasswordHasher
from app.Domains.Security.contracts import InvalidToken, SecurityUnavailable
from app.Domains.Security.controllers.http import router
from app.Domains.Security.dependencies import get_security_service
from app.Domains.Security.models.session import AuthSession
from app.Domains.Security.services.security_service import SecurityService
from app.Domains.Users.dependencies import get_user_service
from app.Domains.Users.models.user import Permission, User

SECRET = "a-secure-test-secret-of-at-least-forty-eight-bytes-long"


class MemorySessions:
    def __init__(self):
        self.sessions = {}

    async def add(self, user_id, expires_at):
        session = AuthSession(id=uuid4(), user_id=user_id, expires_at=expires_at)
        self.sessions[session.id] = session
        return session

    async def get(self, session_id):
        return self.sessions.get(session_id)

    async def delete(self, session_id):
        self.sessions.pop(session_id, None)


class MemoryUsers:
    def __init__(self, user):
        self.user = user

    async def get_credentials(self, email):
        if self.user and email == self.user.email:
            return self.user.id, self.user.password_hash
        return None

    async def get(self, user_id):
        if self.user and user_id == self.user.id:
            return self.user
        return None


@pytest.fixture
async def auth():
    hasher = Argon2PasswordHasher()
    user = User(
        id=uuid4(),
        first_name="Иван",
        last_name="Иванов",
        middle_name="Иванович",
        email="ivan@example.com",
        phone="+77001234567",
        password_hash=hasher.hash("correct password"),
        created_at=datetime.now(UTC),
        roles=[],
        permissions=[Permission(code="notes.read", name="Read notes")],
    )
    users = MemoryUsers(user)
    service = SecurityService(
        MemorySessions(), users, hasher, JwtTokenCodec(SECRET), 3600, hasher.hash("dummy")
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_security_service] = lambda: service
    app.dependency_overrides[get_user_service] = lambda: users
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, service, users


async def login(client):
    return await client.post(
        "/auth/login", json={"email": " IVAN@example.com ", "password": "correct password"}
    )


async def test_auth_lifecycle_and_live_permissions(auth):
    client, service, users = auth
    response = await login(client)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    token = response.json()["access_token"]
    claims = jwt.decode(token, SECRET, algorithms=["HS256"])
    assert set(claims) == {"jti", "exp"}
    headers = {"Authorization": f"Bearer {token}"}
    me = await client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["full_name"] == "Иванов Иван Иванович"
    assert me.json()["permissions"] == ["notes.read"]
    assert "password_hash" not in me.json()
    users.user.permissions = []
    assert (await client.get("/auth/me", headers=headers)).json()["permissions"] == []
    assert (await client.post("/auth/logout", headers=headers)).status_code == 204
    assert not service.repository.sessions
    assert (await client.get("/auth/me", headers=headers)).status_code == 401


async def test_unknown_and_wrong_password_have_same_response(auth):
    client, service, users = auth
    responses = [
        await client.post("/auth/login", json={"email": email, "password": "wrong"})
        for email in ["ivan@example.com", "unknown@example.com"]
    ]
    assert all(response.status_code == 401 for response in responses)
    assert responses[0].json() == responses[1].json()
    assert not service.repository.sessions


async def test_missing_unknown_and_server_expired_sessions(auth):
    client, service, users = auth
    assert (await client.get("/auth/me")).status_code == 401
    unknown = service.tokens.encode(uuid4(), datetime.now(UTC) + timedelta(hours=1))
    assert (
        await client.get("/auth/me", headers={"Authorization": f"Bearer {unknown}"})
    ).status_code == 401
    token = (await login(client)).json()["access_token"]
    session = next(iter(service.repository.sessions.values()))
    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    headers = {"Authorization": f"Bearer {token}"}
    assert (await client.get("/auth/me", headers=headers)).status_code == 401


async def test_deleted_user_session_rejected(auth):
    client, service, users = auth
    token = (await login(client)).json()["access_token"]
    users.user = None
    assert (
        await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    ).status_code == 401


@pytest.mark.parametrize(
    "claims",
    [
        {"jti": str(uuid4())},
        {"exp": 9999999999},
        {"jti": "bad-id", "exp": 9999999999},
        {"jti": str(uuid4()), "exp": "9999999999"},
        {"jti": str(uuid4()), "exp": 1},
        {"jti": str(uuid4()), "exp": 9999999999, "user_id": str(uuid4())},
    ],
)
def test_invalid_jwt_claims(claims):
    with pytest.raises(InvalidToken):
        JwtTokenCodec(SECRET).decode(jwt.encode(claims, SECRET, algorithm="HS256"))


def test_wrong_signature_algorithm_and_malformed_token():
    codec = JwtTokenCodec(SECRET)
    claims = {"jti": str(uuid4()), "exp": 9999999999}
    for token in [
        jwt.encode(claims, "different-secret-at-least-thirty-two-bytes", algorithm="HS256"),
        jwt.encode(claims, SECRET, algorithm="HS384"),
        jwt.encode(claims, "", algorithm="none"),
        "malformed",
    ]:
        with pytest.raises(InvalidToken):
            codec.decode(token)


def test_password_hashes_are_salted_and_verify_safely():
    hasher = Argon2PasswordHasher()
    first = hasher.hash("password")
    assert first != hasher.hash("password")
    assert hasher.verify(first, "password")
    assert not hasher.verify(first, "wrong")
    assert not hasher.verify("not a valid hash", "password")


def test_missing_secret_fails_closed():
    with pytest.raises(SecurityUnavailable):
        JwtTokenCodec("")


async def test_service_accepts_non_jwt_token_codec(auth):
    client, service, users = auth

    class OpaqueTokens:
        def __init__(self):
            self.issued = {}

        def encode(self, session_id, expires_at):
            token = f"opaque-{uuid4()}"
            self.issued[token] = session_id
            return token

        def decode(self, token):
            if token not in self.issued:
                raise InvalidToken
            return self.issued[token]

    service.tokens = OpaqueTokens()
    response = await login(client)
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert token.startswith("opaque-")
    assert (await client.get("/auth/me", headers=headers)).status_code == 200
    assert (await client.post("/auth/logout", headers=headers)).status_code == 204
    assert (await client.get("/auth/me", headers=headers)).status_code == 401


async def test_missing_secret_returns_503(monkeypatch):
    from types import SimpleNamespace

    from fastapi import Depends

    from app.Domains.Security import dependencies

    monkeypatch.setattr(
        dependencies, "get_settings", lambda: SimpleNamespace(security_jwt_secret=None)
    )
    app = FastAPI()

    @app.get("/configured", dependencies=[Depends(dependencies.get_token_codec)])
    def configured():
        return {"ok": True}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/configured")
    assert response.status_code == 503
    assert response.json() == {"detail": "Authentication is not configured"}


async def test_password_validation_does_not_echo_password(auth):
    from app.main import app

    _, service, users = auth
    app.dependency_overrides[get_security_service] = lambda: service
    app.dependency_overrides[get_user_service] = lambda: users
    password = "private-invalid-password-" * 100
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login", json={"email": "ivan@example.com", "password": password}
            )
        assert response.status_code == 422
        assert "private-invalid-password" not in response.text
        assert all(set(error) <= {"type", "loc", "msg"} for error in response.json()["detail"])
    finally:
        app.dependency_overrides.clear()
