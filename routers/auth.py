"""
Router de autenticación
Valida JWT tokens de fotoshow-v2
"""
from fastapi import APIRouter, Depends, HTTPException, Cookie, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional
import logging
import jwt

from config import settings

log = logging.getLogger(__name__)
router = APIRouter()


class LoginRequest(BaseModel):
    token: str  # JWT token de fotoshow-v2


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: Optional[str] = None


def verify_jwt_token(token: str) -> dict:
    """
    Verifica JWT token de fotoshow-v2
    Retorna el payload del token
    """
    try:
        # Decodificar token (sin verificar firma por ahora)
        # En producción, verificar contra la clave pública de fotoshow-v2
        payload = jwt.decode(
            token,
            options={"verify_signature": False}  # ⚠️ Solo para desarrollo
        )
        return payload
    except Exception as e:
        log.error(f"Invalid token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


def get_jwt_user(fotoshow_token: Optional[str] = Cookie(None)) -> dict:
    """
    Dependency para obtener usuario actual desde JWT cookie
    """
    if not fotoshow_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    return verify_jwt_token(fotoshow_token)


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Login con JWT token de fotoshow-v2
    """
    payload = verify_jwt_token(request.token)

    log.info(f"User logged in: {payload.get('user_id')}")

    return LoginResponse(
        access_token=request.token,
        user_id=payload.get("user_id")
    )


@router.get("/me")
async def get_current_user(current_user: dict = Depends(get_jwt_user)):
    """
    Obtiene info del usuario actual
    """
    return {
        "user_id": current_user.get("user_id"),
        "email": current_user.get("email"),
        "role": current_user.get("role")
    }


@router.post("/logout")
async def logout():
    """
    Logout (por ahora solo borra la cookie del cliente)
    """
    return {"message": "Logged out"}


@router.get("/callback")
async def google_callback(code: Optional[str] = None, state: Optional[str] = None):
    """
    Callback de Google OAuth
    Redirige de vuelta al cliente con el token
    """
    if code:
        # Token de testing (en producción, intercambiar code por token)
        test_token = jwt.encode(
            {"user_id": "test_user", "email": "test@example.com"},
            settings.JWT_SECRET,
            algorithm="HS256"
        )
        redirect_url = f"/?token={test_token}"
        return RedirectResponse(url=redirect_url)

    return {"error": "No code provided"}
