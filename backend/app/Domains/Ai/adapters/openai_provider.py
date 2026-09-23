from time import perf_counter

import structlog
from openai import AsyncOpenAI, OpenAIError

from app.Domains.Ai.adapters.images import data_uri
from app.Domains.Ai.contracts import LlmRequestFailed, LlmUnavailable, Message

logger = structlog.get_logger(__name__)


class OpenAiProvider:
    provider = "openai"
    display_name = "OpenAI"
    api_key_name = "OPENAI_API_KEY"
    base_url: str | None = None

    def __init__(
        self,
        model: str,
        api_key: str | None,
        timeout: float = 120.0,
        *,
        base_url: str | None = None,
        reasoning_effort: str | None = None,
    ):
        # The key is not required to build the object: a missing key must fail on use,
        # not on import or application start.
        self.model = model
        self._api_key = api_key
        self._timeout = timeout
        self.base_url = base_url
        self._reasoning_effort = reasoning_effort
        self._client: AsyncOpenAI | None = None

    async def complete(
        self, *, system: str, messages: list[Message], images: list[bytes] | None = None
    ) -> str:
        client = self._connect()
        payload = self._payload(system, messages, images)
        started = perf_counter()
        try:
            request = {"model": self.model, "messages": payload}
            if self._reasoning_effort is not None:
                request["reasoning_effort"] = self._reasoning_effort
            response = await client.chat.completions.create(**request)
        except OpenAIError as error:
            logger.error(
                "llm.failed",
                provider=self.provider,
                model=self.model,
                duration_ms=round((perf_counter() - started) * 1000),
                error=type(error).__name__,
            )
            raise LlmRequestFailed(f"{self.display_name} request failed: {error}") from error
        usage = response.usage
        logger.info(
            "llm.completed",
            provider=self.provider,
            model=self.model,
            duration_ms=round((perf_counter() - started) * 1000),
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            total_tokens=usage.total_tokens if usage else 0,
            images=len(images or ()),
        )
        return response.choices[0].message.content or ""

    def _connect(self) -> AsyncOpenAI:
        if not self._api_key:
            raise LlmUnavailable(
                f"{self.api_key_name} is not set; the {self.display_name} provider cannot be used"
            )
        if self._client is None:
            options = {"api_key": self._api_key, "timeout": self._timeout}
            if self.base_url is not None:
                options["base_url"] = self.base_url
            self._client = AsyncOpenAI(**options)
        return self._client

    def _payload(
        self, system: str, messages: list[Message], images: list[bytes] | None
    ) -> list[dict[str, object]]:
        if not messages:
            raise LlmRequestFailed("At least one chat message is required")
        payload: list[dict[str, object]] = [{"role": "system", "content": system}]
        payload.extend(dict(message) for message in messages)
        if not images:
            return payload
        last = payload[-1]
        if last["role"] != "user":
            raise LlmRequestFailed("Images can only be attached to a user message")
        last["content"] = [
            {"type": "text", "text": last["content"]},
            *({"type": "image_url", "image_url": {"url": data_uri(image)}} for image in images),
        ]
        return payload
