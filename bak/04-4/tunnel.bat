@echo off
title Tunel SSH - descarga.fotoshow.online
echo.
echo ========================================
echo   🌐 Tunel SSH a descarga.fotoshow.online
echo ========================================
echo.
echo  Conectando al VPS...
echo  Tu Print Server estará disponible en:
echo  https://descarga.fotoshow.online
echo.
echo  NO CIERRES ESTA VENTANA
echo.

:loop
"C:\Program Files\PuTTY\plink.exe" -ssh root@207.148.15.8 -pw "7V[yz$}sJGFXPa_D" -hostkey "SHA256:RUtnFE34USG1OGjt9RUryEbpVY+HIobqpM5Di1qi7Mo" -R 127.0.0.1:3001:127.0.0.1:3000 -N
echo.
echo  Conexión perdida. Reconectando en 5 segundos...
timeout /t 5 /nobreak >nul
goto loop
