@echo off
REM FotoShow - Túnel SSH a VPS
REM ==========================

echo Iniciando tunel SSH a VPS 207.148.15.8...

REM Túnel: Puerto 3001 del VPS -> Puerto 3000 local
REM -N = No abrir terminal
REM -R = Reverse tunnel (VPS -> Local)
REM -L = Local forward (Local -> VPS)
REM -o = Opciones

:retry
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -N -R 0.0.0.0:3001:127.0.0.1:3000 root@207.148.15.8

if %ERRORLEVEL% NEQ 0 (
    echo Túnel terminado con error %ERRORLEVEL%
    echo Reintentando en 5 segundos...
    timeout /t 5 > nul
    goto retry
)

goto retry
