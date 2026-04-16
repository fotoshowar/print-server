"""
Cliente HTTP para conectar con fotoshow-v2 API
"""
import httpx
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from config import settings

log = logging.getLogger(__name__)


class FotoShowClient:
    """Cliente para consumir APIs de fotoshow-v2"""

    def __init__(self, jwt_token: Optional[str] = None):
        self.api_base = settings.FOTOSHOW_API_BASE
        self.jwt_token = jwt_token
        self.headers = self._build_headers()

    def _build_headers(self) -> Dict[str, str]:
        """Construir headers con autenticación"""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "FotoShowPrintServer/1.0",
        }
        if self.jwt_token:
            headers["Authorization"] = f"Bearer {self.jwt_token}"
        return headers

    async def get_galleries(self) -> List[Dict[str, Any]]:
        """
        GET /api/public/galleries — Obtiene galerías públicas

        Returns:
            Lista de galerías con foto_count, status, etc.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                # Usar endpoint público para testing
                resp = await client.get(
                    f"{self.api_base}/api/public/galleries",
                    headers=self.headers
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as e:
            log.error(f"Error fetching galleries: {e}")
            raise

    async def get_gallery_photos(self, gallery_id: int) -> Dict[str, Any]:
        """
        GET /api/public/gallery/{gallery_id} — Obtiene fotos de una galería

        Args:
            gallery_id: ID de la galería en fotoshow-v2

        Returns:
            Información de la galería con lista de fotos
        """
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(
                    f"{self.api_base}/api/public/gallery/{gallery_id}",
                    headers=self.headers
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as e:
            log.error(f"Error fetching gallery {gallery_id}: {e}")
            raise

    async def download_photo(self, presigned_url: str) -> bytes:
        """
        Descarga una foto desde una presigned URL de R2 (Cloudflare)

        Args:
            presigned_url: URL con firma temporal para descargar

        Returns:
            Contenido binario de la foto
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(presigned_url)
                resp.raise_for_status()
                return resp.content
        except httpx.HTTPError as e:
            log.error(f"Error downloading photo: {e}")
            raise

    async def get_photographer_info(self, alias: str) -> Dict[str, Any]:
        """
        GET /api/public/photographer/{alias} — Obtiene info del fotógrafo

        Args:
            alias: Alias del fotógrafo (ej: "juanfoto")

        Returns:
            Info del fotógrafo (email, teléfono, etc.)
        """
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(
                    f"{self.api_base}/api/public/photographer/{alias}",
                    headers=self.headers
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as e:
            log.error(f"Error fetching photographer {alias}: {e}")
            raise

    async def health_check(self) -> bool:
        """Verifica que fotoshow-v2 esté disponible"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self.api_base}/api/public/galleries",
                    headers={"User-Agent": "FotoShowPrintServer/1.0"}
                )
                return resp.status_code == 200
        except Exception as e:
            log.warning(f"FotoShow health check failed: {e}")
            return False


# Instancia global
_client: Optional[FotoShowClient] = None


def get_fotoshow_client(jwt_token: Optional[str] = None) -> FotoShowClient:
    """Factory para obtener cliente de fotoshow-v2"""
    return FotoShowClient(jwt_token=jwt_token)


async def get_client_with_token(jwt_token: str) -> FotoShowClient:
    """Obtener cliente con JWT token específico"""
    return FotoShowClient(jwt_token=jwt_token)
