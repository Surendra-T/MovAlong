from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
ENV_PATH = REPO_ROOT / ".env"
BACKEND_ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"

class Settings(BaseSettings):
    MONGODB_URI: str = "mongodb://localhost:27017/movalong"
    MONGODB_DB: str = "movalong"

    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434/v1"
    OLLAMA_MODEL: str = "gemma2:9b"

    WHISPER_MODEL: str = "base"

    JWT_SECRET: str = "change-this-to-a-secure-random-secret"
    JWT_EXPIRE_DAYS: int = 7

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=(str(ENV_PATH) if ENV_PATH.exists() else str(BACKEND_ENV_PATH)),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
