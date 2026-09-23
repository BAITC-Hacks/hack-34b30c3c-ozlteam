from datetime import datetime
from uuid import UUID

import jwt

from app.Domains.Security.contracts import InvalidToken, SecurityUnavailable


class JwtTokenCodec:
    def __init__(self, secret: str):
        if len(secret.encode()) < 32:
            raise SecurityUnavailable("JWT signing secret must contain at least 32 bytes")
        self._secret = secret

    def encode(self, session_id: UUID, expires_at: datetime) -> str:
        return jwt.encode(
            {"jti": str(session_id), "exp": int(expires_at.timestamp())},
            self._secret,
            algorithm="HS256",
        )

    def decode(self, token: str) -> UUID:
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                options={"require": ["jti", "exp"]},
            )
            if set(claims) != {"jti", "exp"} or type(claims["exp"]) is not int:
                raise InvalidToken
            return UUID(claims["jti"])
        except (jwt.InvalidTokenError, ValueError, TypeError, AttributeError) as error:
            raise InvalidToken from error
