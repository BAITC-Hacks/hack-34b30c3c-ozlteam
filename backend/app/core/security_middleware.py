"""Базовая защита API: заголовки безопасности и ограничение размера тела запроса.

Сознательно минимально: проект учебно-соревновательный, полноценный WAF не нужен.
Ограничение частоты запросов живёт отдельно, на уровне эндпоинтов входа (slowapi).
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

# API отдаёт только JSON и файлы, поэтому политика максимально жёсткая.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
}

_DOCS_CSP = (
    "default-src 'none'; "
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "img-src 'self' https://fastapi.tiangolo.com data:; "
    "font-src 'self' https://cdn.jsdelivr.net data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Добавляет заголовки безопасности ко всем ответам."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            if header == "Content-Security-Policy" and request.url.path == "/docs":
                value = _DOCS_CSP
            response.headers.setdefault(header, value)
        return response


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Отклоняет слишком большие запросы до того, как они будут прочитаны целиком.

    Проверяется заголовок Content-Length. Запрос без него (chunked) пропускается —
    его ограничивает уже сам обработчик загрузки, который считает прочитанные байты.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        super().__init__(app)
        self._max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next) -> Response:
        declared = request.headers.get("content-length")
        if declared is not None:
            try:
                size = int(declared)
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})
            if size > self._max_bytes:
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"Payload larger than {self._max_bytes} bytes"},
                )
        return await call_next(request)
