"""Environment-driven application settings. No secret has a usable default outside development."""
from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LANGUAGES = ("en", "ar", "hi", "ur", "ml", "tl")
RTL_LANGUAGES = ("ar", "ur")
DEV_JWT_SECRET = "dev-only-insecure-jwt-secret-change-me-0000"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_name: str = "LifeLoop"
    service_name: str = "lifeloop-backend"
    environment: Literal["development", "test", "staging", "production"] = "development"
    log_level: str = "INFO"
    log_output: Literal["console", "file", "both", "none"] = "console"
    log_json: bool = True

    # --- Startup behaviour (the two switches requested for local + container runs) ---------------
    run_migrations_on_startup: bool = True
    seed_on_startup: bool = True
    run_workers: bool = True

    # --- Data stores -------------------------------------------------------------------------------
    database_url: str = "postgresql+asyncpg://lifeloop:lifeloop@localhost:5432/lifeloop"
    redis_url: str = ""
    kafka_bootstrap_servers: str = ""
    kafka_client_id: str = "lifeloop-backend"
    kafka_consumer_group: str = "lifeloop-workers"
    neo4j_uri: str = ""
    neo4j_username: str = "neo4j"
    neo4j_password: str = ""

    # --- Auth --------------------------------------------------------------------------------------
    jwt_secret: str = DEV_JWT_SECRET
    pii_hash_key: str = ""  # keyed hash for Emirates IDs; independent of JWT_SECRET so token rotation never breaks matching
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    bcrypt_rounds: int = 12
    require_email_verification: bool = True
    email_verification_ttl_hours: int = 48
    password_reset_ttl_minutes: int = 60
    invitation_ttl_hours: int = 72
    max_failed_logins: int = 5
    lockout_minutes: int = 15
    rate_limit_per_minute: int = 300
    auth_rate_limit_per_minute: int = 20

    # --- Web ---------------------------------------------------------------------------------------
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    public_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"

    # --- Email (Gmail API; console fallback) -------------------------------------------------------
    gmail_credentials_b64: str = ""
    gmail_sender: str = ""
    email_from_name: str = "LifeLoop"
    email_backend: Literal["auto", "gmail", "console"] = "auto"

    # --- ElevenLabs --------------------------------------------------------------------------------
    elevenlabs_api_key: str = ""
    elevenlabs_agent_id: str = ""
    elevenlabs_phone_number_id: str = ""
    elevenlabs_voice_id: str = ""
    elevenlabs_webhook_secret: str = ""
    elevenlabs_base_url: str = "https://api.elevenlabs.io"
    elevenlabs_timeout_seconds: float = 15.0
    elevenlabs_tts_model: str = "eleven_v3"
    elevenlabs_stt_model: str = "scribe_v2"
    voice_tool_secret: str = "dev-voice-tool-secret"
    webhook_tolerance_seconds: int = 300

    # --- Telephony / SMS ---------------------------------------------------------------------------
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # --- Langfuse ----------------------------------------------------------------------------------
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # --- Orchestration -----------------------------------------------------------------------------
    demo_mode: bool = True
    legal_deadline_days: int = 120
    callback_coalesce_seconds: float = 3.0
    callback_ring_timeout_seconds: int = 180
    worker_poll_seconds: float = 0.5
    entity_poll_seconds: float = 20.0
    sla_check_seconds: float = 30.0
    consulate_stall_days: int = 56  # canvas H: 2-8 weeks with no status feed
    adapter_timeout_seconds: float = 5.0
    adapter_max_attempts: int = 3
    adapter_backoff_seconds: float = 0.25
    consumer_max_attempts: int = 3
    storage_dir: str = "./storage"
    max_upload_mb: int = 10

    # --- Demo / seed -------------------------------------------------------------------------------
    seed_demo_data: bool = True
    demo_user_password: str = ""

    @model_validator(mode="after")
    def _guard_production(self) -> "Settings":
        if self.environment == "production":
            if self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET must be set to a random value of at least 32 characters in production")
            if self.voice_tool_secret == "dev-voice-tool-secret":
                raise ValueError("VOICE_TOOL_SECRET must be set in production")
            if len(self.pii_hash_key) < 32:
                raise ValueError("PII_HASH_KEY must be set to a random value of at least 32 characters in production")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.environment in ("development", "test")

    @property
    def elevenlabs_configured(self) -> bool:
        return bool(self.elevenlabs_api_key and self.elevenlabs_agent_id)

    @property
    def langfuse_configured(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)

    @property
    def twilio_configured(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_phone_number)

    @property
    def gmail_configured(self) -> bool:
        return bool(self.gmail_credentials_b64 and self.gmail_sender)

    @property
    def email_sender(self) -> str:
        return f"{self.email_from_name} <{self.gmail_sender}>" if self.gmail_sender else f"{self.email_from_name} <no-reply@lifeloop.local>"


@lru_cache
def get_settings() -> Settings:
    return Settings()
