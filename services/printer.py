"""
Servicio de impresión usando CUPS — EPSON L805
"""
import logging
import subprocess
import re
from typing import List, Optional, Tuple
from pathlib import Path
from datetime import datetime
from PIL import Image
from PIL.ImageOps import exif_transpose
from io import BytesIO

from config import settings
from models import PrintType, PaperType

log = logging.getLogger(__name__)

# CUPS: media= es tamaño de papel, MediaType= es tipo de papel
CUPS_PAPER_SIZE = {
    PrintType.A4: "A4",
    PrintType.A5: "A5",
}

CUPS_MEDIA_TYPE = {
    PaperType.PLAIN: "Plain",
    PaperType.GLOSSY: "Glossy",
    PaperType.MATTE: "Matte",
    PaperType.PHOTO: "Photo",
}

# IPP print-quality: 3=draft, 4=normal, 5=high
CUPS_QUALITY = {
    "high": "5",
    "medium": "4",
    "draft": "3",
}


class PrinterService:
    """Interfaz con CUPS para imprimir en EPSON L805"""

    def __init__(self, printer_name: str = None):
        self.printer = printer_name or settings.DEFAULT_PRINTER
        self.temp_dir = Path(settings.BASE_DIR) / "temp"
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    def is_printer_available(self) -> bool:
        try:
            result = subprocess.run(["lpstat", "-p"], capture_output=True, text=True, timeout=5)
            return self.printer.lower() in result.stdout.lower()
        except Exception as e:
            log.error(f"Error checking printer: {e}")
            return False

    def get_printer_status(self) -> dict:
        """Estado detallado de la impresora vía CUPS"""
        try:
            result = subprocess.run(["lpstat", "-p", "-d"], capture_output=True, text=True, timeout=5)
            output = result.stdout.strip()

            status = "unknown"
            message = ""
            printing_job = None

            for line in output.split("\n"):
                if not line.startswith("printer ") or self.printer not in line:
                    continue
                message = line.strip()
                if "is idle" in line:
                    status = "idle"
                elif "now printing" in line:
                    status = "printing"
                    m = re.search(r"printing (\S+?)\.", line)
                    if m:
                        printing_job = m.group(1)
                elif "stopped" in line or "not ready" in line:
                    status = "error"

            return {
                "status": status,
                "message": message,
                "printing_job": printing_job,
                "available": status in ("idle", "printing"),
                "printer": self.printer,
            }
        except Exception as e:
            log.error(f"Error getting printer status: {e}")
            return {"status": "error", "message": str(e), "available": False, "printer": self.printer}

    def get_queue(self) -> dict:
        """Trabajos en cola de CUPS"""
        try:
            result = subprocess.run(["lpstat", "-o"], capture_output=True, text=True, timeout=5)
            status_result = subprocess.run(["lpstat", "-p"], capture_output=True, text=True, timeout=5)

            # Job que está imprimiendo ahora
            printing_job = ""
            for line in status_result.stdout.split("\n"):
                if "now printing" in line:
                    m = re.search(r"printing (\S+?)\.", line)
                    if m:
                        printing_job = m.group(1)

            jobs = []
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                parts = line.split()
                if len(parts) < 4:
                    continue
                job_id = parts[0]
                user = parts[1]
                size_bytes = int(parts[2]) if parts[2].isdigit() else 0
                date_str = " ".join(parts[3:])
                jobs.append({
                    "job_id": job_id,
                    "user": user,
                    "size_bytes": size_bytes,
                    "size_kb": round(size_bytes / 1024, 1),
                    "date": date_str,
                    "status": "printing" if job_id == printing_job else "pending",
                })

            return {"jobs": jobs, "count": len(jobs)}
        except Exception as e:
            log.error(f"Error getting queue: {e}")
            return {"jobs": [], "count": 0, "error": str(e)}

    def cancel_job(self, job_id: str) -> dict:
        """Cancela un trabajo específico"""
        if not re.match(r"^[A-Za-z0-9_-]+$", job_id):
            return {"success": False, "error": "Invalid job ID"}
        try:
            result = subprocess.run(["cancel", job_id], capture_output=True, text=True, timeout=5)
            if result.returncode != 0:
                return {"success": False, "error": result.stderr.strip()}
            return {"success": True, "cancelled": job_id}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def cancel_all_jobs(self) -> dict:
        """Cancela todos los trabajos de la cola"""
        try:
            subprocess.run(["cancel", "-a", self.printer], capture_output=True, text=True, timeout=5)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def print_photos(
        self,
        photo_paths: List[str],
        print_type: PrintType = PrintType.A4,
        paper_type: PaperType = PaperType.PLAIN,
        print_quality: str = "high",
    ) -> dict:
        """Imprime fotos usando CUPS"""
        if not photo_paths:
            return {"success": False, "error": "No photos to print"}
        try:
            if print_type == PrintType.CONTACT_SHEET:
                return await self._print_contact_sheet(photo_paths, paper_type, print_quality)
            return await self._print_standard(photo_paths, print_type, paper_type, print_quality)
        except Exception as e:
            log.error(f"Print error: {e}")
            return {"success": False, "error": str(e)}

    async def _resolve_photo(self, photo_path: str) -> Tuple[Optional[Image.Image], Optional[str]]:
        """Descarga desde URL o abre desde ruta local. Aplica rotación EXIF."""
        try:
            if photo_path.startswith(("http://", "https://")):
                import httpx
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(photo_path)
                    resp.raise_for_status()
                    img = Image.open(BytesIO(resp.content))
            else:
                if not Path(photo_path).exists():
                    return None, f"File not found: {photo_path}"
                img = Image.open(photo_path)

            img = exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            return img, None
        except Exception as e:
            log.error(f"Error resolving photo {photo_path}: {e}")
            return None, str(e)

    async def _print_standard(
        self,
        photo_paths: List[str],
        paper_size: PrintType,
        paper_type: PaperType,
        quality: str,
    ) -> dict:
        """Imprime fotos individuales en A4/A5"""
        printed = 0
        errors = []

        for photo_path in photo_paths:
            img, err = await self._resolve_photo(photo_path)
            if img is None:
                errors.append(err or "Unknown error")
                continue

            temp_path = None
            try:
                target_size = self._get_paper_size(paper_size)
                img = self._scale_to_paper(img, target_size)

                # JPEG de alta calidad — imagetoraster lo procesa correctamente
                temp_path = self.temp_dir / f"print_{datetime.now().timestamp():.0f}.jpg"
                img.save(str(temp_path), "JPEG", quality=95, dpi=(300, 300))

                self._send_to_printer(str(temp_path), paper_size, paper_type, quality)
                printed += 1
            except Exception as e:
                log.error(f"Error printing photo: {e}")
                errors.append(str(e))
            finally:
                if temp_path and temp_path.exists():
                    temp_path.unlink(missing_ok=True)

        return {
            "success": printed > 0,
            "printed_count": printed,
            "total": len(photo_paths),
            "errors": errors if errors else None,
        }

    def _send_to_printer(
        self,
        file_path: str,
        paper_size: PrintType = PrintType.A4,
        paper_type: PaperType = PaperType.PLAIN,
        quality: str = "high",
    ):
        """Envía archivo a impresora vía lpr con opciones CUPS correctas"""
        cups_size = CUPS_PAPER_SIZE.get(paper_size, "A4")
        cups_media_type = CUPS_MEDIA_TYPE.get(paper_type, "Plain")
        cups_quality = CUPS_QUALITY.get(quality, "5")

        cmd = [
            "lpr", "-P", self.printer,
            "-o", f"media={cups_size}",        # tamaño de papel
            "-o", f"MediaType={cups_media_type}",  # tipo de papel
            "-o", f"print-quality={cups_quality}",  # calidad IPP
            "-o", "fit-to-page",
            file_path,
        ]

        log.info(f"Printing: size={cups_size} media_type={cups_media_type} quality={cups_quality}")
        log.debug(f"lpr command: {' '.join(cmd)}")

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            raise RuntimeError(f"lpr failed: {result.stderr.strip()}")
        log.info(f"Spooled OK: {file_path}")

    def _get_paper_size(self, paper_type: PrintType) -> tuple:
        dpi = 300
        if paper_type == PrintType.A4:
            return (int(210 / 25.4 * dpi), int(297 / 25.4 * dpi))
        elif paper_type == PrintType.A5:
            return (int(148 / 25.4 * dpi), int(210 / 25.4 * dpi))
        return (2480, 3508)

    def _scale_to_paper(self, image: Image.Image, target_size: tuple) -> Image.Image:
        target_w, target_h = target_size
        img_w, img_h = image.size

        # Rotar target si la imagen es landscape
        if (img_w > img_h) != (target_w > target_h):
            target_w, target_h = target_h, target_w

        ratio = min(target_w / img_w, target_h / img_h)
        new_w = int(img_w * ratio)
        new_h = int(img_h * ratio)
        image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

        canvas = Image.new("RGB", (target_w, target_h), "white")
        canvas.paste(image, ((target_w - new_w) // 2, (target_h - new_h) // 2))
        return canvas

    async def _print_contact_sheet(self, photo_paths, paper_type, quality):
        return {"success": False, "error": "Contact sheet not yet implemented"}


_printer_service: Optional[PrinterService] = None


def get_printer_service() -> PrinterService:
    global _printer_service
    if _printer_service is None:
        _printer_service = PrinterService()
    return _printer_service
