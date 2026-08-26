@echo off
REM Lanza la copia de seguridad diaria.
REM
REM Existe como envoltorio porque la tarea programada necesita un ejecutable y
REM un directorio de trabajo fijo: `node scripts\copia-seguridad.mjs` a secas
REM fallaria al no encontrar node_modules si la tarea arranca en System32.

setlocal

cd /d "%~dp0.."

node scripts\copia-seguridad.mjs
set "CODIGO=%errorlevel%"

REM `endlocal` a secas devuelve el codigo a cero y el Programador de tareas
REM veria exito en una copia fallida. Mismo caso que en capture.cmd.
endlocal & exit /b %CODIGO%
