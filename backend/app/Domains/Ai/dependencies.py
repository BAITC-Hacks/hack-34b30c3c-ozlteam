from functools import lru_cache

from app.core.config import get_settings
from app.Domains.Ai.adapters.anthropic_provider import AnthropicProvider
from app.Domains.Ai.adapters.compatible_provider import CompatibleProvider
from app.Domains.Ai.adapters.nvidia_provider import NvidiaProvider
from app.Domains.Ai.adapters.openai_provider import OpenAiProvider
from app.Domains.Ai.contracts import LlmProvider, LlmUnavailable

OPENAI = "openai"
ANTHROPIC = "anthropic"
NVIDIA = "nvidia"
COMPATIBLE = "compatible"


def get_llm_provider() -> LlmProvider:
    """Build the configured provider. Nothing here runs at import time, so a missing key
    fails the call that needs the model instead of the whole application."""
    settings = get_settings()
    provider = settings.llm_provider.strip().lower()
    if provider == NVIDIA:
        model, model_key = settings.nvidia_model.strip(), "NVIDIA_MODEL"
    elif provider == COMPATIBLE:
        model, model_key = settings.compatible_model.strip(), "COMPATIBLE_MODEL"
    else:
        model, model_key = settings.llm_model.strip(), "LLM_MODEL"
    if not model:
        raise LlmUnavailable(f"{model_key} is not set; choose a model for the configured provider")
    if provider == OPENAI:
        key = settings.openai_api_key
        effort = settings.openai_reasoning_effort.strip() or None
        return _openai(model, key.get_secret_value() if key else None, effort)
    if provider == ANTHROPIC:
        key = settings.anthropic_api_key
        return _anthropic(model, key.get_secret_value() if key else None)
    if provider == NVIDIA:
        base_url = settings.nvidia_base_url.strip()
        if not base_url:
            raise LlmUnavailable("NVIDIA_BASE_URL is not set; choose the NVIDIA API endpoint")
        key = settings.nvidia_api_key
        return _nvidia(model, key.get_secret_value() if key else None, base_url)
    if provider == COMPATIBLE:
        base_url = settings.compatible_base_url.strip()
        if not base_url:
            raise LlmUnavailable(
                "COMPATIBLE_BASE_URL is not set; choose an OpenAI-compatible API endpoint"
            )
        key = settings.compatible_api_key
        return _compatible(model, key.get_secret_value() if key else None, base_url)
    raise LlmUnavailable(
        f"LLM_PROVIDER '{provider}' is not supported; use openai, anthropic, nvidia or compatible"
    )


# A provider owns an HTTP connection pool, so reuse one instance per configuration.
@lru_cache
def _openai(model: str, api_key: str | None, reasoning_effort: str | None) -> OpenAiProvider:
    return OpenAiProvider(model, api_key, reasoning_effort=reasoning_effort)


@lru_cache
def _anthropic(model: str, api_key: str | None) -> AnthropicProvider:
    return AnthropicProvider(model, api_key)


@lru_cache
def _nvidia(model: str, api_key: str | None, base_url: str) -> NvidiaProvider:
    return NvidiaProvider(model, api_key, base_url=base_url)


@lru_cache
def _compatible(model: str, api_key: str | None, base_url: str) -> CompatibleProvider:
    return CompatibleProvider(model, api_key, base_url=base_url)
