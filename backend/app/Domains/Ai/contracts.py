from typing import Protocol

# Chat message as accepted by every provider: {"role": "user"|"assistant", "content": "..."}.
Message = dict[str, str]


class AiError(Exception):
    """Base error of the Ai domain."""


class LlmUnavailable(AiError):
    """The provider is not configured: no API key, unknown provider or missing model."""


class LlmRequestFailed(AiError):
    """The provider was reachable but the completion failed."""


class UnsupportedImage(AiError):
    """The image bytes are not in a format the providers accept."""


class LlmProvider(Protocol):
    async def complete(
        self, *, system: str, messages: list[Message], images: list[bytes] | None = None
    ) -> str: ...
