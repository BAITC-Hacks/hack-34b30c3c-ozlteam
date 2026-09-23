from app.Domains.Ai.adapters.openai_provider import OpenAiProvider


class NvidiaProvider(OpenAiProvider):
    """NVIDIA API Catalog uses the OpenAI-compatible chat completions endpoint."""

    provider = "nvidia"
    display_name = "NVIDIA"
    api_key_name = "NVIDIA_API_KEY"
