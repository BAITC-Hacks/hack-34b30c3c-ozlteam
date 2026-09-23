from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.security_middleware import SecurityHeadersMiddleware


async def test_swagger_docs_can_load_its_assets_without_relaxing_api_policy():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/docs-extra")
    async def docs_extra():
        return {"ok": True}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        docs = await client.get("/docs")
        schema = await client.get("/openapi.json")
        other = await client.get("/docs-extra")

    assert docs.status_code == 200
    assert "swagger-ui-bundle.js" in docs.text
    docs_csp = docs.headers["Content-Security-Policy"]
    assert "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'" in docs_csp
    assert "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'" in docs_csp
    assert "connect-src 'self'" in docs_csp
    assert docs.headers["X-Frame-Options"] == "DENY"

    strict_csp = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    assert schema.headers["Content-Security-Policy"] == strict_csp
    assert other.headers["Content-Security-Policy"] == strict_csp
