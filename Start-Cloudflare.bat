@echo off
title FotoShow Cloudflare Tunnel
echo.
echo ========================================
echo   🌐 Cloudflare Tunnel - fotoshow.site
echo ========================================
echo.
echo  Iniciando túnel...
echo  Tu Print Server estará en:
echo  https://fotoshow.site
echo.
echo  Presiona Ctrl+C para detener
echo.

cd C:\Program Files\cloudflared
cloudflared tunnel run fotoshow-tunnel

pause
