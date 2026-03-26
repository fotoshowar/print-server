@echo off
REM FotoShow Print Server - Inicio
REM ================================

echo Iniciando FotoShow Print Server...

REM Levantar el servidor Node
start /B node server.js
echo Servidor iniciado en puerto 3000

timeout /t 2 > nul

REM Esperar a que el servidor este listo
echo Verificando que el servidor este corriendo...
timeout /t 3 > nul

REM Levantar el tunel SSH (si esta configurado)
if exist tunnel.bat (
    echo Levantando tunel SSH...
    start /B cmd /c tunnel.bat
)

echo.
echo ========================================
echo FotoShow Print Server corriendo!
echo http://localhost:3000
echo http://descarga.fotoshow.online
echo ========================================
echo.
echo Presiona Ctrl+C para detener todo
echo.

REM Mantener ventana abierta
:loop
timeout /t 5 > nul
goto loop
