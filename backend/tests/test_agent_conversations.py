"""Persisted orchestration boundaries; DB cases roll back every change."""

import os
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.config import get_settings
from app.core.errors import DomainError
from app.Domains.Ai.contracts import LlmRequestFailed
from app.Domains.Ai.DTO.conversation import CreateConversation, ProposalDecision, SendMessage
from app.Domains.Ai.repositories.conversation_repository import ConversationRepository
from app.Domains.Ai.services.conversation_service import ConversationService
from app.Domains.Users.models import User
from app.main import app


class FakeEngine:
    def __init__(self):
        self.calls = []
        self.error = None
        self.result = dict(content="Ответ", assistant_id="help", tool_calls=[], sources=[])

    async def run(self, content, history, **kwargs):
        self.calls.append((content, history, kwargs))
        if self.error:
            raise self.error
        return deepcopy(self.result)


class FakeTools:
    def __init__(self):
        self.writes = []
        self.preview = {"lines": [{"quantity": "12"}]}

    async def prepare(self, kind, payload):
        return dict(
            kind=kind,
            payload=payload,
            preview=deepcopy(self.preview),
            title="Серверный заголовок",
            summary="Только после подтверждения",
        )

    async def confirm(self, kind, payload, key):
        self.writes.append((kind, payload, key))
        return {"kind": kind, "status": "queued"}


@pytest.fixture
async def workspace():
    if os.getenv("RUN_DB_TESTS") != "1":
        pytest.skip("opt-in PostgreSQL")
    engine = create_async_engine(get_settings().database_url)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        factory = async_sessionmaker(
            connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        try:
            async with factory() as session, session.begin():
                user = User(first_name="Agent isolated QA", roles=[], permissions=[])
                session.add(user)
                await session.flush()
                repository = ConversationRepository(session)
                llm, tools = FakeEngine(), FakeTools()
                service = ConversationService(repository, user.id, tools, lambda: llm)
                conversation = await service.create(CreateConversation())
                yield SimpleNamespace(
                    service=service,
                    repository=repository,
                    llm=llm,
                    tools=tools,
                    conversation=conversation,
                )
        finally:
            await transaction.rollback()
    await engine.dispose()


def message(**kwargs):
    return SendMessage(
        content=kwargs.pop("content", "Как сделать заказ?"),
        client_request_id=kwargs.pop("client_request_id", uuid4()),
        **kwargs,
    )


async def test_all_agent_endpoints_require_login():
    identifier = str(uuid4())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        for path in [
            "assistants",
            "knowledge",
            "conversations",
            f"conversations/{identifier}",
            f"conversations/{identifier}/messages",
        ]:
            response = await c.get("/api/v1/ai/" + path)
            assert response.status_code == 401, (path, response.text)
        for path, payload in [
            ("chat", {"question": "hello"}),
            ("conversations", {}),
            (f"conversations/{identifier}/messages", message().model_dump(mode="json")),
            (
                f"conversations/{identifier}/proposals/{identifier}/decision",
                {"decision": "confirm", "expected_version": 1},
            ),
        ]:
            response = await c.post("/api/v1/ai/" + path, json=payload)
            assert response.status_code == 401, (path, response.text)


def test_openapi_exposes_typed_agent_contracts():
    schema = app.openapi()
    schemas = schema["components"]["schemas"]
    assert schemas["SendMessage"]["additionalProperties"] is False
    assert schemas["SendMessage"]["properties"]["allow_business_data"]["default"] is False
    assert schemas["ProposalDecision"]["properties"]["decision"]["enum"] == ["confirm", "cancel"]
    operation = schema["paths"]["/api/v1/ai/conversations/{conversation_id}/messages"]["post"]
    assert operation["security"] == [{"HTTPBearer": []}]
    assert {"401", "403", "404", "409", "422", "429", "503"} <= operation["responses"].keys()
    assert schema["paths"]["/api/v1/ai/chat"]["post"]["deprecated"]


async def test_owner_isolation_and_message_idempotency(workspace):
    w = workspace
    assert w.conversation.id.version == 7
    stranger = ConversationService(w.repository, uuid4(), w.tools, lambda: w.llm)
    assert await stranger.list(50, 0) == []
    for operation in [
        stranger.get(w.conversation.id),
        stranger.messages(w.conversation.id, 100, 0),
        stranger.send(w.conversation.id, message()),
    ]:
        with pytest.raises(DomainError) as error:
            await operation
        assert error.value.status_code == 404
    command = message()
    first = await w.service.send(w.conversation.id, command)
    replay = await w.service.send(w.conversation.id, command)
    assert len(w.llm.calls) == 1
    assert [m.id for m in first.messages] == [m.id for m in replay.messages]
    assert first.title == command.content
    with pytest.raises(DomainError) as error:
        await w.service.send(
            w.conversation.id,
            message(content="Другая строка", client_request_id=command.client_request_id),
        )
    assert error.value.code == "message_key_conflict"


async def test_private_tool_context_is_not_reused_after_consent_changes(workspace):
    w = workspace
    w.llm.result["content"] = "PRIVATE_SUMMARY"
    await w.service.send(w.conversation.id, message(allow_business_data=True))
    await w.service.send(w.conversation.id, message(content="Объясни интерфейс"))
    assert w.llm.calls[-1][1] == []
    assert not w.llm.calls[-1][2]["allow_business_data"]


async def prepare_proposal(w):
    w.llm.result["proposal"] = dict(
        kind="create_orders",
        payload={"recommendation_ids": [str(uuid4())]},
        title="Недоверенный заголовок",
        preview={"quantity": "999999"},
    )
    return await w.service.send(w.conversation.id, message(allow_business_data=True))


async def test_confirm_is_authoritative_and_exactly_once(workspace):
    w = workspace
    result = await prepare_proposal(w)
    proposal = result.proposals[0]
    assert proposal.title == "Серверный заголовок"
    assert proposal.preview == w.tools.preview
    assert w.tools.writes == []
    command = ProposalDecision(expected_version=1, decision="confirm")
    result = await w.service.decide(w.conversation.id, proposal.id, command)
    assert result.proposals[0].status == "confirmed"
    assert result.proposals[0].version == 2
    await w.service.decide(w.conversation.id, proposal.id, command)
    assert len(w.tools.writes) == 1
    assert w.tools.writes[0][2] == f"ai-proposal:{proposal.id}"
    with pytest.raises(DomainError):
        await w.service.decide(
            w.conversation.id, proposal.id, ProposalDecision(expected_version=1, decision="cancel")
        )


async def test_stale_preview_version_cancel_and_foreign_decision(workspace):
    w = workspace
    proposal = (await prepare_proposal(w)).proposals[0]
    stranger = ConversationService(w.repository, uuid4(), w.tools, lambda: w.llm)
    with pytest.raises(DomainError) as error:
        await stranger.decide(
            w.conversation.id, proposal.id, ProposalDecision(expected_version=1, decision="confirm")
        )
    assert error.value.status_code == 404
    with pytest.raises(DomainError) as error:
        await w.service.decide(
            w.conversation.id, proposal.id, ProposalDecision(expected_version=7, decision="confirm")
        )
    assert error.value.code == "proposal_version_conflict"
    w.tools.preview["lines"][0]["quantity"] = "15"
    with pytest.raises(DomainError) as error:
        await w.service.decide(
            w.conversation.id, proposal.id, ProposalDecision(expected_version=1, decision="confirm")
        )
    assert error.value.code == "proposal_stale"
    command = ProposalDecision(expected_version=1, decision="cancel")
    result = await w.service.decide(w.conversation.id, proposal.id, command)
    await w.service.decide(w.conversation.id, proposal.id, command)
    assert result.proposals[0].status == "cancelled"
    assert w.tools.writes == []


async def test_history_pagination_survives_repository_reload(workspace):
    w = workspace
    for number in range(105):
        await w.repository.add_message(
            w.conversation.id,
            role="assistant",
            assistant_id="help",
            content=str(number),
            tool_calls=[],
            sources=[],
        )
    result = await w.service.get(w.conversation.id)
    assert result.has_older_messages
    assert [int(row.content) for row in result.messages] == list(range(5, 105))
    older = await w.service.messages(w.conversation.id, 100, 100)
    assert [int(row.content) for row in older] == list(range(5))


async def test_provider_failure_is_safe_and_does_not_save_half_message(workspace):
    w = workspace
    w.llm.error = LlmRequestFailed("PRIVATE_PROVIDER_BODY")
    with pytest.raises(DomainError) as error:
        await w.service.send(w.conversation.id, message())
    assert error.value.status_code == 503
    assert "PRIVATE" not in error.value.detail
    assert (await w.service.get(w.conversation.id)).messages == []


async def test_rate_limit_and_inflight_lock(workspace, monkeypatch):
    w = workspace

    async def busy(_):
        return False

    monkeypatch.setattr(w.repository, "try_user_lock", busy)
    with pytest.raises(DomainError) as error:
        await w.service.send(w.conversation.id, message())
    assert error.value.code == "assistant_busy"
    monkeypatch.undo()
    for _ in range(10):
        await w.service.send(w.conversation.id, message())
    with pytest.raises(DomainError) as error:
        await w.service.send(w.conversation.id, message())
    assert error.value.status_code == 429
