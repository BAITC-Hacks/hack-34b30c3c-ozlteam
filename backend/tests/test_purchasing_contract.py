"""Cross-domain HTTP security and generated Swagger contract checks."""

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.Domains.Security.dependencies import get_current_user
from app.Domains.Users.models.user import User
from app.main import app


@pytest.mark.parametrize(
    "path",
    [
        "/files/00000000-0000-0000-0000-000000000000/content",
        "/jobs/00000000-0000-0000-0000-000000000000/events",
        "/catalogs/products",
        "/inventory",
        "/imports",
        "/integrations/1c/sources",
        "/replenishment/runs",
        "/orders",
        "/overview",
    ],
)
async def test_purchasing_data_requires_authentication(path):
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        response = await client.get("/api/v1" + path)
    assert response.status_code == 401, response.text


async def test_authenticated_user_without_purchase_right_cannot_approve():
    app.dependency_overrides[get_current_user] = lambda: User(
        id=uuid4(), first_name="Читатель", roles=[], permissions=[]
    )
    try:
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/orders/{uuid4()}/approve", json={"expected_version": 1}
            )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_openapi_documents_auth_async_jobs_and_binary_exports():
    schema = app.openapi()
    protected = (
        "/catalogs",
        "/inventory",
        "/imports",
        "/integrations",
        "/replenishment",
        "/recommendations",
        "/orders",
        "/overview",
        "/files",
        "/jobs",
    )
    for path, methods in schema["paths"].items():
        if not path.startswith(tuple("/api/v1" + prefix for prefix in protected)):
            continue
        for method, operation in methods.items():
            if method == "parameters":
                continue
            assert operation.get("security"), (path, method)
            assert "401" in operation["responses"], (path, method)
            assert "403" in operation["responses"], (path, method)
    assert "202" in schema["paths"]["/api/v1/replenishment/runs"]["post"]["responses"]
    export = schema["paths"]["/api/v1/orders/{order_id}/export"]["get"]["responses"]["200"]
    assert "text/csv" in export["content"]
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in export["content"]
    assert "application/json" not in export["content"]
    events = schema["paths"]["/api/v1/jobs/{job_id}/events"]["get"]["responses"]["200"]
    assert "text/event-stream" in events["content"]
