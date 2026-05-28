"""
Print Server v2 - FastAPI
Cliente de fotoshow-v2 para impresión de fotos
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from config import settings
from database import init_db
from routers import galleries, printer, auth, fotos

# Logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup y shutdown events"""
    log.info("🚀 Starting Print Server v2...")
    await init_db()
    log.info("✅ Database initialized")
    yield
    log.info("🛑 Shutting down Print Server v2...")


app = FastAPI(
    title="FotoShow Print Server",
    description="Cliente FastAPI para impresión de fotos desde fotoshow-v2",
    version="2.0.0",
    lifespan=lifespan
)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(galleries.router, prefix="/api", tags=["galleries"])
app.include_router(printer.router, prefix="/api/printer", tags=["printer"])
app.include_router(fotos.router, prefix="/api", tags=["fotos"])

# Static files
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
else:
    log.warning(f"Static directory not found: {static_dir}")


@app.get("/")
async def root():
    """Redirect to index.html"""
    return FileResponse("static/index.html")


@app.get("/fotos")
async def fotos_page():
    return FileResponse("static/fotos.html")


@app.get("/queue")
async def queue_page():
    return FileResponse("static/queue.html")


@app.get("/health")
async def health():
    """Health check"""
    return {"status": "ok", "version": "2.0.0"}


@app.get("/api/config")
async def get_config():
    """Retorna configuración del servidor (info pública)"""
    return {
        "api_base": settings.FOTOSHOW_API_BASE,
        "printer": settings.DEFAULT_PRINTER,
        "print_quality": settings.PRINT_QUALITY
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info"
    )
