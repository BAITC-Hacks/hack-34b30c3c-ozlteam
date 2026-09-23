from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_db: str = "hackathon"
    postgres_user: str = "hackathon"
    postgres_password: str = "hackathon_dev"
    security_jwt_secret: SecretStr | None = None
    security_token_ttl_seconds: int = Field(default=3600, ge=60, le=86400)

    # Доступ из браузера: список origin через запятую.
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    # REST 1С: разрешённые оператором origin через запятую. Пусто — запросы запрещены.
    onec_allowed_origins: str = ""

    # Фоновые задачи.
    redis_url: str = "redis://redis:6379/0"

    # Хранилище загруженных файлов.
    storage_path: str = "/data/uploads"
    storage_max_upload_mb: int = Field(default=25, ge=1, le=200)

    # Провайдер модели. Ключи только из окружения, в коде их нет.
    llm_provider: str = "openai"
    llm_model: str = "gpt-5"
    openai_api_key: SecretStr | None = None
    openai_reasoning_effort: str = ""
    anthropic_api_key: SecretStr | None = None
    nvidia_model: str = ""
    nvidia_base_url: str = ""
    nvidia_api_key: SecretStr | None = None
    compatible_model: str = ""
    compatible_base_url: str = ""
    compatible_api_key: SecretStr | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.storage_max_upload_mb * 1024 * 1024

    @property
    def database_url(self) -> URL:
        return URL.create(
            "postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
