from time import perf_counter

import structlog
from anthropic import AnthropicError, AsyncAnthropic

from app.Domains.Ai.adapters.images import encode
from app.Domains.Ai.contracts import LlmRequestFailed, LlmUnavailable, Message

logger = structlog.get_logger(__name__)

PROVIDER = "anthropic"


class AnthropicProvider:
    def __init__(
        self, model: str, api_key: str | None, max_tokens: int = 4096, timeout: float = 120.0
    ):
        # The key is not required to build the object: a missing key must fail on use,
        # not on import or application start.
        self.model = model
        self.max_tokens = max_tokens
        self._api_key = api_key
        self._timeout = timeout
        self._client: AsyncAnthropic | None = None

    async def complete(
        self, *, system: str, messages: list[Message], images: list[bytes] | None = None
    ) -> str:
        client = self._connect()
        payload = self._payload(messages, images)
        started = perf_counter()
        try:
            response = await client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=system,
                messages=payload,
            )
        except AnthropicError as error:
            logger.error(
                "llm.failed",
                provider=PROVIDER,
                model=self.model,
                duration_ms=round((perf_counter() - started) * 1000),
                error=type(error).__name__,
            )
            raise LlmRequestFailed(f"Anthropic request failed: {error}") from error
        usage = response.usage
        logger.info(
            "llm.completed",
            provider=PROVIDER,
            model=self.model,
            duration_ms=round((perf_counter() - started) * 1000),
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.input_tokens + usage.output_tokens,
            images=len(images or ()),
        )
        return "".join(block.text for block in response.content if block.type == "text")

    def _connect(self) -> AsyncAnthropic:
        if not self._api_key:
            raise LlmUnavailable(
                "ANTHROPIC_API_KEY is not set; the Anthropic provider cannot be used"
            )
        if self._client is None:
            self._client = AsyncAnthropic(api_key=self._api_key, timeout=self._timeout)
        return self._client

    def _payload(
        self, messages: list[Message], images: list[bytes] | None
    ) -> list[dict[str, object]]:
        if not messages:
            raise LlmRequestFailed("At least one chat message is required")
        payload: list[dict[str, object]] = [dict(message) for message in messages]
        if not images:
            return payload
        last = payload[-1]
        if last["role"] != "user":
            raise LlmRequestFailed("Images can only be attached to a user message")
        blocks: list[dict[str, object]] = []
        for image in images:
            media_type, data = encode(image)
            blocks.append(
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": data},
                }
            )
        blocks.append({"type": "text", "text": last["content"]})
        last["content"] = blocks
        return payload
