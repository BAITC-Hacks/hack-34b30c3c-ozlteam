from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.Domains.Users.DTO.user import CreateUser
from app.Domains.Users.models import Permission, Role, User
from app.Domains.Users.services.user_service import UserService


def test_user_without_permissions():
    user = User(first_name="Reader")

    assert user.get_permissions() == set()
    assert not user.has_permission("notes.read")


def test_user_with_individual_permissions():
    user = User(
        first_name="Reader",
        permissions=[Permission(code="notes.read", name="Read notes")],
    )

    assert user.get_permissions() == {"notes.read"}
    assert user.has_permission("notes.read")
    assert not user.has_permission("notes.write")


def test_permissions_combine_multiple_roles_and_individual_grants_by_code():
    user = User(
        first_name="Editor",
        permissions=[Permission(code="notes.read", name="Personal read grant")],
        roles=[
            Role(
                code="reader",
                name="Reader",
                permissions=[Permission(code="notes.read", name="Read notes")],
            ),
            Role(
                code="editor",
                name="Editor",
                permissions=[
                    Permission(code="notes.read", name="Read notes"),
                    Permission(code="notes.write", name="Write notes"),
                ],
            ),
            Role(code="empty", name="Empty role"),
        ],
    )

    assert user.get_permissions() == {"notes.read", "notes.write"}
    assert user.has_permission("notes.write")
    assert not user.has_permission("notes.delete")


def test_permissions_reflect_grants_and_revocations_without_cached_results():
    read = Permission(code="notes.read", name="Read notes")
    write = Permission(code="notes.write", name="Write notes")
    role = Role(code="editor", name="Editor", permissions=[read])
    user = User(first_name="Editor", permissions=[read], roles=[role])

    permissions = user.get_permissions()
    permissions.add("notes.delete")
    assert user.get_permissions() == {"notes.read"}

    role.permissions.append(write)
    assert user.get_permissions() == {"notes.read", "notes.write"}

    user.permissions.clear()
    assert user.has_permission("notes.read")

    role.permissions.remove(read)
    assert not user.has_permission("notes.read")
    assert user.get_permissions() == {"notes.write"}

    user.roles.clear()
    assert user.get_permissions() == set()


@pytest.mark.parametrize(
    ("first", "last", "middle", "expected"),
    [
        ("Иван", "Иванов", "Иванович", "Иванов Иван Иванович"),
        (" Иван ", " Иванов ", None, "Иванов Иван"),
        ("Иван", None, None, "Иван"),
        ("Иван", "  ", " \t ", "Иван"),
    ],
)
def test_full_name(first, last, middle, expected):
    assert User(first_name=first, last_name=last, middle_name=middle).full_name == expected


def create_user_data(**overrides):
    return CreateUser.model_validate(
        {
            "first_name": " Иван ",
            "last_name": " Иванов ",
            "email": "USER@Example.com",
            "password": "test-password-123",
            **overrides,
        }
    )


def test_create_user_data_normalizes_profile_and_hides_password():
    data = create_user_data(middle_name=" Иванович ", phone="+77001234567")

    assert data.first_name == "Иван"
    assert data.last_name == "Иванов"
    assert data.middle_name == "Иванович"
    assert data.email == "user@example.com"
    assert data.phone == "+77001234567"
    assert data.password.get_secret_value() == "test-password-123"
    assert "test-password-123" not in repr(data)
    assert "test-password-123" not in data.model_dump_json()
    assert create_user_data().phone is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"first_name": "   "},
        {"last_name": "   "},
        {"email": "invalid-email"},
        {"phone": "77001234567"},
        {"phone": "+07001234567"},
        {"phone": "+7700 123 4567"},
        {"password": "x" * 11},
        {"password": "x" * 129},
    ],
)
def test_create_user_data_rejects_invalid_fields(overrides):
    with pytest.raises(ValidationError):
        create_user_data(**overrides)


@pytest.mark.parametrize("field", ["first_name", "last_name", "email", "password"])
def test_create_user_data_requires_identity_fields(field):
    payload = create_user_data().model_dump()
    del payload[field]
    with pytest.raises(ValidationError):
        CreateUser.model_validate(payload)


async def test_user_service_hashes_password_before_saving():
    repository = Mock()
    repository.add = AsyncMock(side_effect=lambda user: user)
    passwords = Mock()
    passwords.hash.return_value = "stored-password-hash"
    data = create_user_data(middle_name="Иванович", phone="+77001234567")

    user = await UserService(repository).create(data, passwords)

    passwords.hash.assert_called_once_with("test-password-123")
    repository.add.assert_awaited_once_with(user)
    assert user.password_hash == "stored-password-hash"
    assert not hasattr(user, "password")
    assert "test-password-123" not in vars(user).values()
    assert user.full_name == "Иванов Иван Иванович"
    assert user.email == "user@example.com"
    assert user.phone == "+77001234567"


async def test_credentials_lookup_normalizes_email():
    credentials = (uuid4(), "stored-password-hash")
    repository = Mock()
    repository.get_credentials = AsyncMock(return_value=credentials)

    assert await UserService(repository).get_credentials(" USER@Example.com ") == credentials
    repository.get_credentials.assert_awaited_once_with("user@example.com")
