"""
Router para listar galerías desde fotoshow-v2
Sincroniza fotos automáticamente
"""
from fastapi import APIRouter, Depends, HTTPException, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List, Optional
from datetime import datetime
import logging

from database import get_db
from models import Gallery, Photo, Photographer
from schemas import GalleryOut, PhotoOut
from services.fotoshow_client import get_client_with_token
from config import settings

log = logging.getLogger(__name__)
router = APIRouter()


async def get_jwt_token(request_token: Optional[str] = Cookie(None, alias=settings.FOTOSHOW_JWT_COOKIE)) -> Optional[str]:
    """Extrae JWT token de cookie (opcional para testing)"""
    return request_token


@router.get("/galleries", response_model=List[dict])
async def list_galleries(
    db: AsyncSession = Depends(get_db),
    jwt_token: Optional[str] = Depends(get_jwt_token),
):
    """
    Lista galerías del fotógrafo autenticado (desde fotoshow-v2)

    Por ahora, solo retorna datos sin guardar en BD
    """
    try:
        # Conectar a fotoshow-v2 (usar token si está disponible)
        if not jwt_token:
            log.warning("No JWT token provided - fetching public galleries")
        client = await get_client_with_token(jwt_token) if jwt_token else await get_client_with_token("")
        galleries = await client.get_galleries()

        log.info(f"✅ Fetched {len(galleries)} galleries from fotoshow.online")
        return galleries

    except Exception as e:
        log.error(f"Error listing galleries: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gallery/{gallery_id}")
async def get_gallery(gallery_id: int):
    """
    Obtiene fotos de una galería desde fotoshow.online
    Temporalmente sin autenticación para development
    """
    try:
        client = await get_client_with_token("")
        gal_data = await client.get_gallery_photos(gallery_id)
        log.info(f"✅ Fetched {len(gal_data.get('photos', []))} photos for gallery {gallery_id}")
        return gal_data
    except Exception as e:
        log.error(f"Error getting gallery {gallery_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Funciones auxiliares de sincronización
# ─────────────────────────────────────────────────────────────────────────────

async def _sync_gallery(db: AsyncSession, gal_data: dict) -> Gallery:
    """Sincroniza una galería desde fotoshow-v2 a DB local"""
    gallery_id = gal_data.get("id")

    # Convertir event_date de string ISO a datetime si es necesario
    event_date = gal_data.get("event_date")
    if event_date and isinstance(event_date, str):
        try:
            event_date = datetime.fromisoformat(event_date.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            event_date = None

    # Buscar si ya existe
    result = await db.execute(
        select(Gallery).where(Gallery.fotoshow_gallery_id == gallery_id)
    )
    gallery = result.scalar_one_or_none()

    if gallery:
        # Actualizar
        gallery.name = gal_data.get("name")
        gallery.description = gal_data.get("description")
        gallery.location = gal_data.get("location")
        gallery.event_date = event_date
        gallery.price_per_photo = gal_data.get("price_per_photo")
        gallery.updated_at = datetime.utcnow()
    else:
        # Crear
        gallery = Gallery(
            fotoshow_gallery_id=gallery_id,
            name=gal_data.get("name", "Unknown"),
            description=gal_data.get("description"),
            location=gal_data.get("location"),
            event_date=event_date,
            price_per_photo=gal_data.get("price_per_photo"),
            photo_count=gal_data.get("photo_count", 0),
        )
        db.add(gallery)

    await db.flush()
    return gallery


async def _sync_gallery_photos(db: AsyncSession, gallery: Gallery, jwt_token: str):
    """Sincroniza fotos de una galería desde fotoshow-v2"""
    try:
        client = await get_client_with_token(jwt_token)
        gal_data = await client.get_gallery_photos(gallery.fotoshow_gallery_id)

        photos = gal_data.get("photos", [])

        for photo_data in photos:
            photo_id = photo_data.get("id")

            # Buscar si ya existe
            result = await db.execute(
                select(Photo).where(Photo.fotoshow_photo_id == photo_id)
            )
            photo = result.scalar_one_or_none()

            if not photo:
                # Crear
                photo = Photo(
                    fotoshow_photo_id=photo_id,
                    gallery_id=gallery.id,
                    filename=photo_data.get("filename", "unknown"),
                    width=photo_data.get("width"),
                    height=photo_data.get("height"),
                    faces_detected=photo_data.get("faces_count", 0),
                    file_size=photo_data.get("file_size"),
                    s3_key=photo_data.get("s3_key"),
                    s3_thumbnail_key=photo_data.get("s3_thumbnail_key"),
                )
                db.add(photo)

        gallery.photo_count = len(photos)
        gallery.synced_photo_count = len(photos)
        gallery.last_sync_at = datetime.utcnow()

        await db.commit()

    except Exception as e:
        log.error(f"Error syncing gallery photos: {e}")
        await db.rollback()
        raise
