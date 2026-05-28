"""
Modelos SQLAlchemy para Print Server
Base de datos local (SQLite) para rastrear estado de sincronización e impresiones
"""
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, Float,
    ForeignKey, JSON, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum

from database import Base


class SyncStatus(str, Enum):
    """Estados de sincronización de fotos desde fotoshow-v2"""
    PENDING = "pending"
    SYNCING = "syncing"
    SYNCED = "synced"
    FAILED = "failed"


class PrintType(str, Enum):
    """Tipos de impresión disponibles"""
    A4 = "A4"
    A5 = "A5"
    CONTACT_SHEET = "contact_sheet"


class PaperType(str, Enum):
    """Tipos de papel disponibles"""
    PLAIN = "plain"
    GLOSSY = "glossy"
    MATTE = "matte"
    PHOTO = "photo"


class Gallery(Base):
    """Galería sincronizada desde fotoshow-v2"""
    __tablename__ = "galleries"

    id = Column(Integer, primary_key=True)
    fotoshow_gallery_id = Column(Integer, unique=True, index=True)  # ID en fotoshow-v2
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    location = Column(String(255), nullable=True)
    event_date = Column(DateTime, nullable=True)
    price_per_photo = Column(Float, nullable=True)
    photo_count = Column(Integer, default=0)
    synced_photo_count = Column(Integer, default=0)
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    photos = relationship("Photo", back_populates="gallery", cascade="all, delete-orphan")
    print_logs = relationship("PrintLog", back_populates="gallery", cascade="all, delete-orphan")


class Photo(Base):
    """Foto sincronizada desde fotoshow-v2"""
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True)
    fotoshow_photo_id = Column(Integer, unique=True, index=True)  # ID en fotoshow-v2
    gallery_id = Column(Integer, ForeignKey("galleries.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    local_path = Column(String(512), nullable=True)  # Ruta local si está descargada
    s3_key = Column(String(512), nullable=True)  # Clave en R2 (Cloudflare)
    s3_thumbnail_key = Column(String(512), nullable=True)
    sync_status = Column(SQLEnum(SyncStatus), default=SyncStatus.PENDING)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    faces_detected = Column(Integer, default=0)
    file_size = Column(Integer, nullable=True)
    print_count = Column(Integer, default=0)  # Veces impresa
    created_at = Column(DateTime, default=datetime.utcnow)
    synced_at = Column(DateTime, nullable=True)

    # Relaciones
    gallery = relationship("Gallery", back_populates="photos")
    print_items = relationship("PrintItem", back_populates="photo")


class PrintLog(Base):
    """Registro de impresiones realizadas"""
    __tablename__ = "print_logs"

    id = Column(Integer, primary_key=True)
    gallery_id = Column(Integer, ForeignKey("galleries.id"), nullable=True)
    print_type = Column(SQLEnum(PrintType), nullable=False)  # A4, A5, contact_sheet
    paper_type = Column(SQLEnum(PaperType), default=PaperType.PLAIN)  # plain, glossy, matte, photo
    print_count = Column(Integer, default=1)  # Cuántas veces se imprimió
    printer_model = Column(String(100), default="EPSON_L805")
    print_quality = Column(String(50), default="high")  # high, medium, draft
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    notes = Column(Text, nullable=True)

    # Relaciones
    gallery = relationship("Gallery", back_populates="print_logs")
    items = relationship("PrintItem", back_populates="print_log")


class PrintItem(Base):
    """Cada foto en un registro de impresión"""
    __tablename__ = "print_items"

    id = Column(Integer, primary_key=True)
    print_log_id = Column(Integer, ForeignKey("print_logs.id"), nullable=False)
    photo_id = Column(Integer, ForeignKey("photos.id"), nullable=False)
    position = Column(Integer, nullable=True)  # Posición en la hoja
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relaciones
    print_log = relationship("PrintLog", back_populates="items")
    photo = relationship("Photo", back_populates="print_items")


class SyncLog(Base):
    """Registro de intentos de sincronización"""
    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True)
    gallery_id = Column(Integer, ForeignKey("galleries.id"), nullable=True)
    photo_id = Column(Integer, ForeignKey("photos.id"), nullable=True)
    status = Column(String(50), nullable=False)  # success, failed, partial
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Photographer(Base):
    """Información del fotógrafo (sincronizado desde fotoshow-v2)"""
    __tablename__ = "photographer"

    id = Column(Integer, primary_key=True)
    fotoshow_id = Column(String(100), unique=True, nullable=True)  # UUID de fotoshow-v2
    alias = Column(String(100), unique=True, index=True, nullable=True)
    email = Column(String(255), nullable=True)
    jwt_token = Column(Text, nullable=True)  # Token para acceder a fotoshow-v2
    created_at = Column(DateTime, default=datetime.utcnow)
    last_sync_at = Column(DateTime, nullable=True)
