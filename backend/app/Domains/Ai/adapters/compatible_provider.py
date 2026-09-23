from app.Domains.Ai.adapters.openai_provider import OpenAiProvider


class CompatibleProvider(OpenAiProvider):
    """Chat completions over an OpenAI-compatible HTTP API."""

    provider = "compatible"
    display_name = "OpenAI-compatible HTTP API"
    api_key_name = "COMPATIBLE_API_KEY"
