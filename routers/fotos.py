"""
Router para explorar y descargar fotos de la cámara Sony
"""
import io
import zipfile
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

FOTOS_DIR = Path("/home/fotoshow/fotos")
FOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".raw", ".arw", ".cr2", ".nef"}

router = APIRouter()


def es_foto(path: Path) -> bool:
    return path.suffix.lower() in FOTO_EXTENSIONS


@router.get("/fotos")
def listar_carpetas():
    if not FOTOS_DIR.exists():
        return []
    carpetas = []
    for item in sorted(FOTOS_DIR.iterdir(), reverse=True):
        if item.is_dir():
            fotos = [f for f in item.iterdir() if f.is_file() and es_foto(f)]
            carpetas.append({"nombre": item.name, "cantidad": len(fotos)})
    # Fotos sueltas en raíz
    sueltas = [f for f in FOTOS_DIR.iterdir() if f.is_file() and es_foto(f)]
    if sueltas:
        carpetas.insert(0, {"nombre": "_raiz", "cantidad": len(sueltas)})
    return carpetas


@router.get("/fotos/{carpeta}")
def listar_fotos(carpeta: str):
    if carpeta == "_raiz":
        base = FOTOS_DIR
    else:
        base = FOTOS_DIR / carpeta
    if not base.exists():
        raise HTTPException(404, "Carpeta no encontrada")
    fotos = sorted([f.name for f in base.iterdir() if f.is_file() and es_foto(f)])
    return {"carpeta": carpeta, "fotos": fotos}


@router.get("/fotos/{carpeta}/imagen/{filename}")
def ver_foto(carpeta: str, filename: str):
    if carpeta == "_raiz":
        ruta = FOTOS_DIR / filename
    else:
        ruta = FOTOS_DIR / carpeta / filename
    if not ruta.exists() or not ruta.is_file():
        raise HTTPException(404, "Foto no encontrada")
    return FileResponse(str(ruta))


@router.get("/fotos/{carpeta}/zip")
def descargar_zip(carpeta: str):
    if carpeta == "_raiz":
        base = FOTOS_DIR
    else:
        base = FOTOS_DIR / carpeta
    if not base.exists():
        raise HTTPException(404, "Carpeta no encontrada")

    fotos = [f for f in base.iterdir() if f.is_file() and es_foto(f)]
    if not fotos:
        raise HTTPException(404, "No hay fotos en esta carpeta")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for foto in fotos:
            zf.write(foto, foto.name)
    buf.seek(0)

    nombre_zip = f"fotos_{carpeta}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{nombre_zip}"'}
    )
