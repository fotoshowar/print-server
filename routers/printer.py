"""
Router para funciones de impresión
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List
from datetime import datetime
import logging

from database import get_db
from models import PrintLog, Photo
from schemas import PrintRequest, PrintResponse
from services.printer import PrinterService
from routers.auth import get_jwt_user

log = logging.getLogger(__name__)
router = APIRouter()

# Instancia global del servicio de impresión
printer_service = PrinterService()


@router.post("/print", response_model=PrintResponse)
async def print_photos(
    request: PrintRequest,
    current_user: dict = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Imprime fotos seleccionadas

    Flujo:
    1. Validar fotos existen en DB
    2. Descargar fotos desde R2 (via presigned URLs)
    3. Generar PDF
    4. Enviar a CUPS/impresora
    5. Registrar en PrintLog
    """
    try:
        log.info(f"Print request from {current_user.get('user_id')}: {len(request.photo_ids)} fotos")

        # Validar fotos
        stmt = select(Photo).where(Photo.id.in_(request.photo_ids))
        result = await db.execute(stmt)
        photos = result.scalars().all()

        if not photos:
            raise HTTPException(status_code=404, detail="No photos found")

        if len(photos) != len(request.photo_ids):
            raise HTTPException(status_code=400, detail="Some photos not found")

        # Preparar lista de URLs para descargar
        photo_urls = [p.presigned_url or p.photo_url for p in photos]

        # Imprimir (genera PDF y envía a CUPS)
        result = await printer_service.print_photos(
            photo_urls=photo_urls,
            paper_size=request.paper_size,
            quality=request.quality,
            copies=request.copies
        )

        # Registrar en BD
        print_log = PrintLog(
            photographer_id=current_user.get("user_id"),
            photo_count=len(photos),
            paper_size=request.paper_size,
            quality=request.quality,
            copies=request.copies,
            status="completed" if result["success"] else "failed",
            printer_name=result.get("printer_name"),
            job_id=result.get("job_id"),
            notes=result.get("error") if not result["success"] else None
        )
        db.add(print_log)
        await db.commit()

        log.info(f"Print completed: {result}")

        return PrintResponse(
            success=result["success"],
            message=f"Printed {len(photos)} photos",
            job_id=result.get("job_id"),
            print_log_id=print_log.id
        )

    except Exception as e:
        log.error(f"Print error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Print failed: {str(e)}")


@router.get("/status/{job_id}")
async def get_print_status(job_id: str):
    """
    Obtiene estado de un trabajo de impresión
    """
    try:
        status = await printer_service.get_job_status(job_id)
        return {
            "job_id": job_id,
            "status": status,
            "timestamp": datetime.utcnow()
        }
    except Exception as e:
        log.error(f"Error getting print status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get status")


@router.get("/printers")
async def list_available_printers():
    """
    Lista impresoras disponibles en el sistema
    """
    try:
        printers = await printer_service.list_printers()
        return {"printers": printers}
    except Exception as e:
        log.error(f"Error listing printers: {e}")
        raise HTTPException(status_code=500, detail="Failed to list printers")


@router.get("/history")
async def get_print_history(
    current_user: dict = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 20
):
    """
    Obtiene historial de impresiones del usuario
    """
    try:
        stmt = (
            select(PrintLog)
            .where(PrintLog.photographer_id == current_user.get("user_id"))
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
                    "photo_count": log.photo_count,
                    "paper_size": log.paper_size,
                    "quality": log.quality,
                    "status": log.status,
                    "created_at": log.created_at,
                    "printer_name": log.printer_name
                }
                for log in logs
            ]
        }
    except Exception as e:
        log.error(f"Error getting print history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get history")
