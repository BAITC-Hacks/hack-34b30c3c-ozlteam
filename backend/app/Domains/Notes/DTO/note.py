from pydantic import BaseModel, ConfigDict, Field


class CreateNote(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
