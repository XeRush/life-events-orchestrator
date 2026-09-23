"""Environment-driven application settings. No secrets are hard-coded."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_name: str = "LIFELOOP"
    environment: str = "development"
    debug: bool = False

    database_url: str = "postgresql+asyncpg://lifeloop:lifeloop@localhost:5432/lifeloop"
    redis_url: str = ""  # optional: reserved for caching / rate limiting / job queues

    jwt_secret: str = "dev-only-change-me-dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    bcrypt_rounds: int = 12

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    public_base_url: str = "http://localhost:8000"

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_agent_id: str = ""
    elevenlabs_phone_number_id: str = ""  # only needed for real outbound (telephony) callbacks
    elevenlabs_voice_id: str = ""
    elevenlabs_webhook_secret: str = ""
    elevenlabs_base_url: str = "https://api.elevenlabs.io"
    elevenlabs_timeout_seconds: float = 15.0
    voice_tool_secret: str = "dev-voice-tool-secret"

    # Orchestration
    demo_mode: bool = True
    run_workers: bool = True
    callback_delay_seconds: float = 4.0  # coalescing window before a callback is placed
    callback_worker_interval: float = 2.0
    delay_significant_hours: int = 72
    adapter_max_attempts: int = 3
    adapter_backoff_seconds: float = 0.2
    default_max_task_attempts: int = 2
    simulation_autopilot: bool = False
    simulation_autopilot_seconds: int = 30

    storage_dir: str = "./storage"
    rate_limit_per_minute: int = 300
    auth_rate_limit_per_minute: int = 30

    demo_user_email: str = "demo@lifeloop.example"
    demo_user_password: str = "demo1234"
    seed_on_start: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def elevenlabs_configured(self) -> bool:
        return bool(self.elevenlabs_api_key and self.elevenlabs_agent_id)


@lru_cache
def get_settings() -> Settings:
    return Settings()
