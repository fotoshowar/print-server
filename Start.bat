@echo off
title FotoShow Print Server + Tunnel
echo.
echo  ================================================
echo   FotoShow Print Server + Tunnel SSH
echo  ================================================
echo.

cd /d "%~dp0"

:: Iniciar Print Server en background
echo  [1/2] Iniciando Print Server...
start /b node server.js
timeout /t 3 /nobreak >nul
echo        Print Server corriendo en puerto 3000
echo.

:: Iniciar tunel SSH con auto-reconexion
echo  [2/2] Conectando tunel SSH...
echo        descarga.fotoshow.online
echo.
echo  NO CIERRES ESTA VENTANA
echo  ================================================
echo.

:tunnel_loop
echo  [%date% %time%] Conectando tunel...
"C:\Program Files\PuTTY\plink.exe" -ssh root@207.148.15.8 -pw "7V[yz$}sJGFXPa_D" -hostkey "SHA256:RUtnFE34USG1OGjt9RUryEbpVY+HIobqpM5Di1qi7Mo" -R 0.0.0.0:3001:127.0.0.1:3000 -N
echo  [%date% %time%] Tunel desconectado. Reintentando en 10s...
timeout /t 10 /nobreak >nul
goto tunnel_loop
