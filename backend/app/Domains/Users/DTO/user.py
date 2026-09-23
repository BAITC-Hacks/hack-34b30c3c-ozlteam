from pydantic import BaseModel, EmailStr, Field, SecretStr, field_validator


class CreateUser(BaseModel):
    first_name: str = Field(min_length=1, max_length=200)
    last_name: str = Field(min_length=1, max_length=200)
    middle_name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, pattern=r"^\+[1-9][0-9]{7,14}$")
    email: EmailStr = Field(max_length=254)
    password: SecretStr = Field(min_length=12, max_length=128)

    @field_validator("first_name", "last_name", "middle_name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("email", mode="after")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()
