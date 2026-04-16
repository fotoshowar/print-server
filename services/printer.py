"""
Servicio de impresión usando CUPS
Interfaz con impresora EPSON L805 vía lpr
"""
import logging
import subprocess
from typing import List, Optional
from pathlib import Path
from datetime import datetime
from PIL import Image
from io import BytesIO

from config import settings
from models import PrintType

log = logging.getLogger(__name__)


class PrinterService:
    """Interfaz con CUPS para imprimir en EPSON L805"""

    def __init__(self, printer_name: str = None):
        self.printer = printer_name or settings.DEFAULT_PRINTER
        self.quality = settings.PRINT_QUALITY

    def is_printer_available(self) -> bool:
        """Verifica que la impresora esté disponible en CUPS"""
        try:
            result = subprocess.run(
                ["lpstat", "-p"],
                capture_output=True,
                text=True,
                timeout=5
            )
            return self.printer.lower() in result.stdout.lower()
        except Exception as e:
            log.error(f"Error checking printer: {e}")
            return False

    async def print_photos(
        self,
        photo_paths: List[str],
        print_type: PrintType = PrintType.A4,
        print_quality: str = "high",
    ) -> dict:
        """
        Imprime fotos usando CUPS

        Args:
            photo_paths: Lista de rutas locales a fotos
            print_type: A4, A5, o contact_sheet
            print_quality: high, medium, draft

        Returns:
            {success: bool, printed_count: int, error: Optional[str]}
        """
        if not photo_paths:
            return {"success": False, "error": "No photos to print"}

        try:
            if print_type == PrintType.CONTACT_SHEET:
                return await self._print_contact_sheet(photo_paths, print_quality)
            else:
                return await self._print_standard(photo_paths, print_type, print_quality)

        except Exception as e:
            log.error(f"Print error: {e}")
            return {"success": False, "error": str(e)}

    async def _print_standard(
        self,
        photo_paths: List[str],
        paper_size: PrintType,
        quality: str,
    ) -> dict:
        """Imprime fotos en A4/A5 con auto-orientación"""
        try:
            printed = 0
            for photo_path in photo_paths:
                if not Path(photo_path).exists():
                    log.warning(f"Photo not found: {photo_path}")
                    continue

                # Convertir imagen (auto-rotate según EXIF)
                image = Image.open(photo_path)
                if hasattr(image, "_getexif") and image._getexif() is not None:
                    from PIL.ImageOps import exif_transpose
                    image = exif_transpose(image)

                # Escalar a tamaño de papel
                target_size = self._get_paper_size(paper_size)
                image = self._scale_to_paper(image, target_size)

                # Generar PDF temporal
                pdf_path = Path(settings.BASE_DIR) / "temp" / f"print_{datetime.now().timestamp()}.pdf"
                pdf_path.parent.mkdir(parents=True, exist_ok=True)
                image.save(str(pdf_path), "PDF")

                # Enviar a impresora
                self._send_to_printer(str(pdf_path), quality)
                printed += 1

                # Limpiar
                pdf_path.unlink()

            return {
                "success": True,
                "printed_count": printed,
                "total": len(photo_paths)
            }

        except Exception as e:
            log.error(f"Standard print error: {e}")
            return {"success": False, "error": str(e)}

    async def _print_contact_sheet(
        self,
        photo_paths: List[str],
        quality: str,
    ) -> dict:
        """Genera una hoja de contactos (múltiples fotos por página)"""
        try:
            # Crear hoja de contactos (ej: 4x6 = 24 fotos por página)
            grid_cols = 4
            grid_rows = 6
            thumb_size = (150, 150)

            photos_per_sheet = grid_cols * grid_rows
            sheets = (len(photo_paths) + photos_per_sheet - 1) // photos_per_sheet

            pdf_path = Path(settings.BASE_DIR) / "temp" / f"contact_sheet_{datetime.now().timestamp()}.pdf"
            pdf_path.parent.mkdir(parents=True, exist_ok=True)

            # Generar PDF con múltiples páginas
            images = []
            for i, photo_path in enumerate(photo_paths):
                if not Path(photo_path).exists():
                    continue

                img = Image.open(photo_path)
                img.thumbnail(thumb_size, Image.Resampling.LANCZOS)
                images.append(img)

            if images:
                # TODO: Implementar layout de grilla y guardar como PDF
                # Por ahora: salvar primera imagen como PDF temporal
                images[0].save(str(pdf_path), "PDF")

                # Enviar a impresora
                self._send_to_printer(str(pdf_path), quality)

                # Limpiar
                pdf_path.unlink()

                return {
                    "success": True,
                    "printed_count": len(images),
                    "sheets": sheets
                }

            return {"success": False, "error": "No valid photos"}

        except Exception as e:
            log.error(f"Contact sheet error: {e}")
            return {"success": False, "error": str(e)}

    def _send_to_printer(self, file_path: str, quality: str = "high"):
        """Envía archivo a impresora vía lpr"""
        quality_options = {
            "high": ["-o", "media=A4", "-o", "PrintQuality=High"],
            "medium": ["-o", "media=A4", "-o", "PrintQuality=Normal"],
            "draft": ["-o", "media=A4", "-o", "PrintQuality=Draft"],
        }

        opts = quality_options.get(quality, quality_options["high"])

        cmd = ["lpr", "-P", self.printer] + opts + [file_path]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                log.error(f"lpr error: {result.stderr}")
            else:
                log.info(f"Sent to printer: {file_path}")
        except Exception as e:
            log.error(f"Error sending to printer: {e}")
            raise

    def _get_paper_size(self, paper_type: PrintType) -> tuple:
        """Obtiene dimensiones en píxeles para tipo de papel (300 DPI)"""
        dpi = 300
        if paper_type == PrintType.A4:
            # A4: 210 × 297 mm
            return (int(210 / 25.4 * dpi), int(297 / 25.4 * dpi))
        elif paper_type == PrintType.A5:
            # A5: 148 × 210 mm
            return (int(148 / 25.4 * dpi), int(210 / 25.4 * dpi))
        else:
            return (2480, 3508)  # A4 default

    def _scale_to_paper(self, image: Image.Image, target_size: tuple) -> Image.Image:
        """Escala imagen para ajustar al tamaño de papel manteniendo relación"""
        target_w, target_h = target_size
        img_w, img_h = image.size

        # Calcular ratio
        ratio = min(target_w / img_w, target_h / img_h)

        new_w = int(img_w * ratio)
        new_h = int(img_h * ratio)

        # Redimensionar
        image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # Crear canvas blanco del tamaño exacto
        canvas = Image.new("RGB", target_size, "white")
        x = (target_w - new_w) // 2
        y = (target_h - new_h) // 2
        canvas.paste(image, (x, y))

        return canvas


# Instancia global
_printer_service: Optional[PrinterService] = None


def get_printer_service() -> PrinterService:
    """Factory para obtener servicio de impresora"""
    global _printer_service
    if _printer_service is None:
        _printer_service = PrinterService()
    return _printer_service
