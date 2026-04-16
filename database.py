"""
Configuración de base de datos SQLite (async)
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from config import settings
import logging

log = logging.getLogger(__name__)

# Crear DB directory si no existe
settings.DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# URL de conexión SQLite (async)
DATABASE_URL = f"sqlite+aiosqlite:///{settings.DB_PATH}"

# Engine async
engine = create_async_engine(
    DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True,
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# Base para modelos
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Dependencia para obtener sesión de DB en routers"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Crear todas las tablas"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info(f"Database initialized at {settings.DB_PATH}")
