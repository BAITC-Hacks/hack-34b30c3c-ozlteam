from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Role = Literal["user", "assistant"]


class ChatTurn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    role: Role
    content: str = Field(min_length=1, max_length=4000)


class AskAssistant(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    question: str = Field(min_length=1, max_length=4000)
    # Deprecated compatibility input. Persisted /ai/conversations owns history now.
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
