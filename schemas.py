"""
Schemas Pydantic para Print Server
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class PrintTypeEnum(str, Enum):
    A4 = "A4"
    A5 = "A5"
    CONTACT_SHEET = "contact_sheet"


class PaperTypeEnum(str, Enum):
    """Tipos de papel disponibles"""
    PLAIN = "plain"
    GLOSSY = "glossy"
    MATTE = "matte"
    PHOTO = "photo"


class PhotoBase(BaseModel):
    filename: str
    fotoshow_photo_id: int
    width: Optional[int] = None
    height: Optional[int] = None
    faces_detected: int = 0


class PhotoOut(PhotoBase):
    id: int
    gallery_id: int
    local_path: Optional[str] = None
    thumbnail_url: Optional[str] = None
    sync_status: str
    print_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class GalleryBase(BaseModel):
    name: str
    location: Optional[str] = None
    event_date: Optional[datetime] = None
    description: Optional[str] = None


class GalleryCreate(GalleryBase):
    pass


class GalleryOut(GalleryBase):
    id: int
    fotoshow_gallery_id: int
    photo_count: int
    synced_photo_count: int
    price_per_photo: Optional[float] = None
    last_sync_at: Optional[datetime] = None
    created_at: datetime
    photos: List[PhotoOut] = []

    class Config:
        from_attributes = True


class PrintLogBase(BaseModel):
    print_type: PrintTypeEnum
    paper_type: PaperTypeEnum = PaperTypeEnum.PLAIN
    print_count: int = 1
    printer_model: str = "EPSON_L805"
    print_quality: str = "high"


class PrintItemIn(BaseModel):
    photo_id: int


class PrintLogCreate(PrintLogBase):
    gallery_id: Optional[int] = None
    items: List[PrintItemIn]


class PrintItemOut(BaseModel):
    id: int
    photo_id: int
    position: Optional[int] = None

    class Config:
        from_attributes = True


class PrintLogOut(PrintLogBase):
    id: int
    gallery_id: Optional[int] = None
    created_at: datetime
    items: List[PrintItemOut] = []

    class Config:
        from_attributes = True


class PhotographerOut(BaseModel):
    id: int
    alias: Optional[str] = None
    email: Optional[str] = None
    fotoshow_id: Optional[str] = None
    last_sync_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ErrorResponse(BaseModel):
    detail: str
    status_code: int = 400


class HealthResponse(BaseModel):
    status: str
    fotoshow_api: Optional[str] = None
    printer: str
    database: str
    timestamp: datetime


class PrintRequest(BaseModel):
    photo_ids: List[int]
    print_type: PrintTypeEnum = PrintTypeEnum.A4
    paper_type: PaperTypeEnum = PaperTypeEnum.PLAIN
    quality: str = "high"
    copies: int = 1


class PrintResponse(BaseModel):
    success: bool
    message: str
    job_id: Optional[str] = None
    print_log_id: Optional[int] = None
