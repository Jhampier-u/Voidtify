@echo off
REM Dispara una ejecucion de captura contra el endpoint del cron.
REM
REM Existe como script en vez de meter el curl directamente en schtasks /TR
REM porque el parser de schtasks rompe con comillas anidadas: el secreto
REM acababa interpretandose como un argumento suelto.
REM
REM Lee CRON_SECRET de .env.local, asi que el secreto no aparece ni en la
REM definicion de la tarea programada ni en ningun log.
REM
REM El puerto es fijo y propio de Voidtify. Estuvo en el 3000 y otra copia del
REM proyecto que corre en esta maquina se lo quito: la captura siguio
REM disparandose puntual contra la app equivocada, que respondia con un error
REM porque su base de datos no tiene el token. Ver README.

setlocal

set "PUERTO=3210"

for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b "CRON_SECRET=" "%~dp0..\.env.local"`) do set "SECRET=%%b"

if "%SECRET%"=="" (
  echo ERROR: no se encontro CRON_SECRET en .env.local
  exit /b 1
)

REM -f hace que curl salga con codigo distinto de cero ante un 4xx o 5xx. Sin
REM el, una respuesta de error contaba como ejecucion correcta y el registro de
REM la tarea programada no servia para detectar que algo iba mal.
curl.exe -f -s -S -X POST -H "x-cron-secret: %SECRET%" http://127.0.0.1:%PUERTO%/api/cron/capture
set "CODIGO=%errorlevel%"

REM `endlocal` a secas devuelve el codigo a cero, asi que el fallo de curl se
REM perdia justo en la ultima linea y el Programador de tareas seguia viendo
REM exito. Con `&` en la misma linea, %CODIGO% se expande antes de que
REM `endlocal` corra, y el codigo real sobrevive.
endlocal & exit /b %CODIGO%
