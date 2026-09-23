from pydantic import BaseModel


class AssistantAnswer(BaseModel):
    answer: str
