@echo off
title Verificar Tunnel
echo.
echo ========================================
echo   Verificar Cloudflare Tunnel
echo ========================================
echo.

echo Estado del servicio:
sc query cloudflared | find "STATE"

echo.
echo Lista de túneles:
cd C:\Program Files\cloudflared
cloudflared tunnel list

echo.
echo Prueba de DNS:
nslookup fotoshow.site

echo.
pause
