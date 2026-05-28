"""
Router para impresión y manejo de cola CUPS
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime
import logging
import re

from database import get_db
from models import PrintLog, Photo
from schemas import PrintRequest, PrintResponse
from services.printer import PrinterService, get_printer_service
from models import PaperType
from routers.auth import get_jwt_user

log = logging.getLogger(__name__)
router = APIRouter()

printer_service = PrinterService()


# ── Impresión ────────────────────────────────────────────────────────────────

@router.post("/print", response_model=PrintResponse)
async def print_photos(
    request: PrintRequest,
    current_user: dict = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Imprime fotos seleccionadas.
    Flujo: validar fotos → descargar desde R2 → escalar → JPEG → CUPS → log
    """
    try:
        log.info(f"Print request from {current_user.get('user_id')}: {len(request.photo_ids)} fotos")

        stmt = select(Photo).where(Photo.id.in_(request.photo_ids))
        result = await db.execute(stmt)
        photos = result.scalars().all()

        if not photos:
            raise HTTPException(status_code=404, detail="No photos found")
        if len(photos) != len(request.photo_ids):
            raise HTTPException(status_code=400, detail="Some photos not found")

        photo_urls = [p.presigned_url or p.photo_url for p in photos]

        paper_type_value = request.paper_type.value if hasattr(request.paper_type, "value") else request.paper_type
        paper_type_enum = PaperType(paper_type_value)

        result = await printer_service.print_photos(
            photo_paths=photo_urls,
            print_type=request.print_type,
            paper_type=paper_type_enum,
            print_quality=request.quality,
        )

        print_log = PrintLog(
            gallery_id=photos[0].gallery_id if photos else None,
            print_type=request.print_type,
            paper_type=paper_type_enum,
            print_count=request.copies,
            print_quality=request.quality,
            notes=result.get("error") if not result["success"] else None,
        )
        db.add(print_log)
        await db.commit()

        return PrintResponse(
            success=result["success"],
            message=f"Printed {result.get('printed_count', 0)} of {len(photos)} photos",
            job_id=result.get("job_id"),
            print_log_id=print_log.id,
        )

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Print error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Print failed: {str(e)}")


# ── Cola de impresión ─────────────────────────────────────────────────────────

@router.get("/queue")
async def get_print_queue():
    """Cola actual de CUPS + estado de la impresora"""
    queue = printer_service.get_queue()
    status = printer_service.get_printer_status()
    return {**queue, "printer": status}


@router.delete("/queue")
async def cancel_all_jobs():
    """Cancela todos los trabajos de la cola"""
    result = printer_service.cancel_all_jobs()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to cancel jobs"))
    return result


@router.delete("/queue/{job_id}")
async def cancel_job(job_id: str):
    """Cancela un trabajo específico"""
    if not re.match(r"^[A-Za-z0-9_-]+$", job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")
    result = printer_service.cancel_job(job_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to cancel job"))
    return result


# ── Estado ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_printer_status():
    """Estado detallado de la impresora"""
    return printer_service.get_printer_status()


@router.get("/printers")
async def list_printers():
    """Lista impresoras disponibles"""
    try:
        import subprocess
        result = subprocess.run(["lpstat", "-p"], capture_output=True, text=True, timeout=5)
        printers = []
        for line in result.stdout.strip().split("\n"):
            if line.startswith("printer "):
                parts = line.split()
                printers.append({
                    "name": parts[1] if len(parts) > 1 else "unknown",
                    "status": "idle" if "is idle" in line else "busy",
                    "raw": line.strip(),
                })
        return {"printers": printers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Historial ─────────────────────────────────────────────────────────────────

@router.get("/history")
async def get_print_history(
    current_user: dict = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
):
    """Historial de impresiones"""
    try:
        stmt = (
            select(PrintLog)
            .order_by(PrintLog.created_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        logs = result.scalars().all()

        return {
            "count": len(logs),
            "history": [
                {
                    "id": log.id,
                    "print_type": log.print_type,
                    "paper_type": log.paper_type,
                    "print_count": log.print_count,
                    "print_quality": log.print_quality,
                    "notes": log.notes,
                    "created_at": log.created_at,
                }
                for log in logs
            ],
        }
    except Exception as e:
        log.error(f"Error getting print history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get history")
