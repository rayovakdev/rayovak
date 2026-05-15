from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    debug: bool = False
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    database_url: str = "postgresql://rayovak:rayovak@localhost:5432/rayovak"
    garmin_email: str = ""
    garmin_password: str = ""


settings = Settings()
