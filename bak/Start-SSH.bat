@echo off
title FotoShow Print Server + Tunnel SSH (LEGACY)
echo.
echo  ================================================
echo   FotoShow Print Server + Tunnel SSH (VIEJO)
echo  ================================================
echo.
echo  USAR: Start.bat + Start-Cloudflare.bat (Nuevo)
echo.
echo  Iniciando Print Server en background...
cd /d "%~dp0"
start /b node server.js
timeout /t 3 /nobreak >nul
echo.
echo  Conectando tunel SSH a descarga.fotoshow.online...
echo  NO CIERRES ESTA VENTANA
echo.
:tunnel_loop
echo  [%date% %time%] Conectando tunel...
"C:\Program Files\PuTTY\plink.exe" -ssh root@207.148.15.8 -pw "7V[yz$}sJGFXPa_D" -hostkey "SHA256:RUtnFE34USG1OGjt9RUryEbpVY+HIobqpM5Di1qi7Mo" -R 0.0.0.0:3001:127.0.0.1:3000 -N
echo  [%date% %time%] Tunel desconectado. Reintentando en 10s...
timeout /t 10 /nobreak >nul
goto tunnel_loop
