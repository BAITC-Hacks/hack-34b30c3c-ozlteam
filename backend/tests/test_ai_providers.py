from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.Domains.Ai import dependencies
from app.Domains.Ai.adapters import openai_provider
from app.Domains.Ai.adapters.compatible_provider import CompatibleProvider
from app.Domains.Ai.adapters.nvidia_provider import NvidiaProvider
from app.Domains.Ai.adapters.openai_provider import OpenAiProvider
from app.Domains.Ai.contracts import LlmUnavailable


async def test_openai_uses_configured_medium_reasoning(monkeypatch):
    settings = SimpleNamespace(
        llm_provider="openai",
        llm_model="gpt-6-sol",
        openai_api_key=SecretStr("test-openai-key"),
        openai_reasoning_effort="medium",
    )
    monkeypatch.setattr(dependencies, "get_settings", lambda: settings)
    request = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            request.update(kwargs)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="Ответ"))], usage=None
            )

    class FakeClient:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(openai_provider, "AsyncOpenAI", FakeClient)

    provider = dependencies.get_llm_provider()
    answer = await provider.complete(
        system="Ты логист", messages=[{"role": "user", "content": "?"}]
    )

    assert isinstance(provider, OpenAiProvider)
    assert answer == "Ответ"
    assert request["model"] == "gpt-6-sol"
    assert request["reasoning_effort"] == "medium"


async def test_nvidia_provider_selects_catalog_endpoint_and_model(monkeypatch):
    settings = SimpleNamespace(
        llm_provider="nvidia",
        llm_model="gpt-5",
        nvidia_model="vendor/model",
        nvidia_base_url="https://nvidia.example.test/v1",
        nvidia_api_key=SecretStr("test-nvidia-key"),
    )
    monkeypatch.setattr(dependencies, "get_settings", lambda: settings)
    client_options = {}
    request = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            request.update(kwargs)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="Ответ"))], usage=None
            )

    class FakeClient:
        def __init__(self, **kwargs):
            client_options.update(kwargs)
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(openai_provider, "AsyncOpenAI", FakeClient)

    provider = dependencies.get_llm_provider()
    answer = await provider.complete(
        system="Ты логист", messages=[{"role": "user", "content": "Где груз?"}]
    )

    assert isinstance(provider, NvidiaProvider)
    assert answer == "Ответ"
    assert client_options["api_key"] == "test-nvidia-key"
    assert client_options["base_url"] == "https://nvidia.example.test/v1"
    assert request == {
        "model": "vendor/model",
        "messages": [
            {"role": "system", "content": "Ты логист"},
            {"role": "user", "content": "Где груз?"},
        ],
    }


async def test_nvidia_provider_requires_model_and_key(monkeypatch):
    settings = SimpleNamespace(
        llm_provider="nvidia",
        llm_model="gpt-5",
        nvidia_model="",
        nvidia_base_url="",
        nvidia_api_key=None,
    )
    monkeypatch.setattr(dependencies, "get_settings", lambda: settings)

    with pytest.raises(LlmUnavailable, match="NVIDIA_MODEL is not set"):
        dependencies.get_llm_provider()

    settings.nvidia_model = "vendor/model"
    with pytest.raises(LlmUnavailable, match="NVIDIA_BASE_URL is not set"):
        dependencies.get_llm_provider()

    settings.nvidia_base_url = "https://nvidia.example.test/v1"
    with pytest.raises(LlmUnavailable, match="NVIDIA_API_KEY is not set"):
        await dependencies.get_llm_provider().complete(
            system="Ты логист", messages=[{"role": "user", "content": "Где груз?"}]
        )


async def test_compatible_provider_uses_configured_http_api(monkeypatch):
    settings = SimpleNamespace(
        llm_provider="compatible",
        compatible_model="qwen-plus",
        compatible_base_url="https://qwen.example.test/compatible-mode/v1",
        compatible_api_key=SecretStr("test-compatible-key"),
    )
    monkeypatch.setattr(dependencies, "get_settings", lambda: settings)
    client_options = {}
    request = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            request.update(kwargs)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="Груз в пути"))],
                usage=None,
            )

    class FakeClient:
        def __init__(self, **kwargs):
            client_options.update(kwargs)
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(openai_provider, "AsyncOpenAI", FakeClient)

    provider = dependencies.get_llm_provider()
    answer = await provider.complete(
        system="Ты логист", messages=[{"role": "user", "content": "Где груз?"}]
    )

    assert isinstance(provider, CompatibleProvider)
    assert answer == "Груз в пути"
    assert client_options["api_key"] == "test-compatible-key"
    assert client_options["base_url"] == "https://qwen.example.test/compatible-mode/v1"
    assert request["model"] == "qwen-plus"
    assert request["messages"] == [
        {"role": "system", "content": "Ты логист"},
        {"role": "user", "content": "Где груз?"},
    ]


async def test_compatible_provider_requires_model_url_and_key(monkeypatch):
    settings = SimpleNamespace(
        llm_provider="compatible",
        compatible_model="",
        compatible_base_url="",
        compatible_api_key=None,
    )
    monkeypatch.setattr(dependencies, "get_settings", lambda: settings)

    with pytest.raises(LlmUnavailable, match="COMPATIBLE_MODEL is not set"):
        dependencies.get_llm_provider()

    settings.compatible_model = "qwen-plus"
    with pytest.raises(LlmUnavailable, match="COMPATIBLE_BASE_URL is not set"):
        dependencies.get_llm_provider()

    settings.compatible_base_url = "https://qwen.example.test/compatible-mode/v1"
    with pytest.raises(LlmUnavailable, match="COMPATIBLE_API_KEY is not set"):
        await dependencies.get_llm_provider().complete(
            system="Ты логист", messages=[{"role": "user", "content": "Где груз?"}]
        )
