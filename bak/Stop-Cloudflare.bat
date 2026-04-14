@echo off
title Detener Tunnel
echo.
echo Deteniendo Cloudflare Tunnel...
echo.

net stop cloudflared

if %errorlevel% equ 0 (
    echo.
    echo ✅ Túnel detenido correctamente
) else (
    echo.
    echo ⚠️  El túnel no estaba corriendo o hubo un error
)

echo.
pause
