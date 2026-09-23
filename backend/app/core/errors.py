"""Application errors translated to HTTP only at the API boundary."""

from pydantic import BaseModel, Field


class DomainError(Exception):
    def __init__(self, detail: str, status_code: int = 422, code: str = "invalid_operation"):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.code = code


class ValidationIssue(BaseModel):
    type: str
    loc: list[str | int]
    msg: str


class ErrorResponse(BaseModel):
    detail: str | list[ValidationIssue] = Field(
        description="Описание ошибки или список ошибок полей без исходных данных"
    )
    code: str | None = Field(default=None, description="Машиночитаемый код предметной ошибки")


ERROR_RESPONSES = {
    401: {"model": ErrorResponse, "description": "Требуется действующая сессия"},
    403: {"model": ErrorResponse, "description": "Недостаточно прав"},
    404: {"model": ErrorResponse, "description": "Объект не найден"},
    409: {"model": ErrorResponse, "description": "Конфликт версии, состояния или ключа повтора"},
    422: {"model": ErrorResponse, "description": "Ошибки полей или недопустимая операция"},
}
