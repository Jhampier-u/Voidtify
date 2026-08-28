@echo off
REM Levanta Voidtify en modo produccion, que es 5,8 veces mas ligero.
REM
REM El modo desarrollo sirve 3,7 MB de JavaScript sin minificar y recompila
REM cada ruta la primera vez que se pide; produccion sirve 653 KB ya
REM compilados. Por un tunel y desde un telefono esa diferencia se nota en
REM cada pantalla.
REM
REM A cambio no hay recarga en caliente: cada cambio de codigo exige volver a
REM ejecutar esto. Para desarrollar sigue estando servidor.cmd.

setlocal

set "PUERTO=3210"

curl.exe -s -o nul --max-time 5 http://127.0.0.1:%PUERTO%/
if not errorlevel 1 (
  echo Ya habia un servidor escuchando en el %PUERTO%. Detenlo antes.
  exit /b 1
)

cd /d "%~dp0.."

echo [%date% %time%] Compilando para produccion... >> "data\servidor.log"
call npm run build >> "data\servidor.log" 2>&1
if errorlevel 1 (
  echo [%date% %time%] La compilacion fallo. No se arranca. >> "data\servidor.log"
  exit /b 1
)

echo [%date% %time%] Arrancando en produccion en el %PUERTO%... >> "data\servidor.log"
call npm run start >> "data\servidor.log" 2>&1

echo [%date% %time%] El servidor termino con codigo %errorlevel%. >> "data\servidor.log"

endlocal
