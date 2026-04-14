@echo off
title Verificar DNS - fotoshow.site
echo.
echo  ================================================
echo   Verificar DNS - fotoshow.site
echo  ================================================
echo.

echo  [1] Verificar nslookup de fotoshow.site
echo  ------------------------------------------
nslookup fotoshow.site
echo.

echo  [2] Verificar nslookup de www.fotoshow.site
echo  ------------------------------------------
nslookup www.fotoshow.site
echo.

echo  [3] Verificar puerto 3000
echo  ------------------------------------------
netstat -ano | findstr :3000
echo.

echo  [4] Verificar tunnel de Cloudflare
echo  ------------------------------------------
cloudflared tunnel list
echo.

echo  ================================================
echo.
echo  Si ves error DNS:
echo  1. Verifica los registros en Cloudflare Dashboard
echo  2. Espera 5-10 min por propagacion
echo  3. El tunnel debe estar corriendo para que responda
echo.
pause
