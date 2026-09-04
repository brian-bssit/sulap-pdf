from pydantic import model_validator
from pydantic_settings import BaseSettings

DEFAULT_SECRET_KEY = "change-me-in-production-use-random-64-char-hex"


class Settings(BaseSettings):
    # extra="ignore": env vars lain (DEV_LOGIN_ENABLED dll) tak error, dibaca via field.
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    # App
    app_name: str = "CloudPDF Toolkit"
    log_level: str = "INFO"
    frontend_url: str = "http://localhost:8080"
    # environment ∈ {development, test, production} — menyalakan fail-fast secret
    environment: str = "development"
    # Gerbang eksplisit dev-login; WAJIB False di production (jangan infer dr oauth).
    dev_login_enabled: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cloudpdf"

    # JWT
    secret_key: str = DEFAULT_SECRET_KEY
    jwt_expiry_days: int = 7

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # PDF
    max_file_size_mb: int = 30
    request_timeout_seconds: int = 600
    max_pages_rearrange: int = 200
    max_pages_edit: int = 200

    # Cleanup
    cleanup_interval_seconds: int = 300
    orphan_age_seconds: int = 900

    @model_validator(mode="after")
    def _guard_secret(self):
        # JWT di-sign key publik → siapa pun bisa forge token admin. Tolak start.
        if self.environment == "production" and (
            not self.secret_key or self.secret_key == DEFAULT_SECRET_KEY
        ):
            raise ValueError(
                "SECRET_KEY wajib di-set (bukan default) saat environment=production"
            )
        return self


settings = Settings()
