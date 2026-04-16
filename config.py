"""
Configuración del Print Server (FastAPI)
"""
from pydantic_settings import BaseSettings
from pathlib import Path
import logging


class Settings(BaseSettings):
    # App config
    PORT: int = 3000
    DEBUG: bool = True

    # Base paths
    BASE_DIR: Path = Path(__file__).parent
    UPLOADS_DIR: Path = BASE_DIR / "uploads"
    THUMBS_DIR: Path = BASE_DIR / "thumbs"
    DB_PATH: Path = BASE_DIR / "db" / "print_state.db"

    # Printer config
    DEFAULT_PRINTER: str = "EPSON_L805"
    PRINT_QUALITY: str = "high"  # high, medium, draft

    # FotoShow v2 API
    FOTOSHOW_API_BASE: str = "https://fotoshow.online"
    FOTOSHOW_PHOTOGRAPHER_ID: str = ""  # UUID o alias del fotógrafo
    FOTOSHOW_API_TOKEN: str = ""  # JWT token si es necesario

    # JWT
    JWT_SECRET: str = "your-secret-key-here"
    FOTOSHOW_JWT_COOKIE: str = "fotoshow_token"

    # Public domain
    PUBLIC_DOMAIN: str = "fotoshow.site"
    CLOUDFLARE_DOMAIN: str = "fotoshow.site"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Instancia global
settings = Settings()

# Setup logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
log = logging.getLogger(__name__)
