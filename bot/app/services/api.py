import httpx


class ApiClient:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def is_ready(self) -> bool:
        try:
            response = await self.client.get("/api/health/ready")
            response.raise_for_status()
            return response.json().get("status") == "ok"
        except (httpx.HTTPError, ValueError):
            return False
