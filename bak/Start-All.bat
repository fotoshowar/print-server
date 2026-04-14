@echo off
title FotoShow Print Server + Cloudflare Tunnel
echo.
echo  ================================================
echo   FotoShow Print Server + Cloudflare Tunnel
echo  ================================================
echo.
echo  [1/3] Verificando puerto 3000...
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo  [WARN] Proceso %%a corriendo en puerto 3000
    echo         Cerrando proceso...
    taskkill /F /PID %%a >nul 2>&1
    if %errorlevel% equ 0 echo         Proceso cerrado correctamente
    timeout /t 2 /nobreak >nul
)
echo         Puerto libre
echo.

echo  [2/3] Iniciando Print Server...
start /b cmd /c "node server.js"
timeout /t 5 /nobreak >nul
echo         Print Server corriendo en puerto 3000
echo.

echo  [3/3] Iniciando Cloudflare Tunnel...
echo         fotoshow.site -> localhost:3000
echo.
echo  ================================================
echo  NO CIERRES ESTA VENTANA
echo  ================================================
echo.

:loop
cloudflared tunnel run fotoshow-tunnel
if %errorlevel% neq 0 (
    echo.
    echo  [%date% %time%] Tunnel desconectado. Reintentando en 10s...
    timeout /t 10 /nobreak >nul
    goto loop
)
