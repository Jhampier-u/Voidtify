@echo off
REM Levanta Voidtify si no hay ya uno escuchando.
REM
REM Lo lanza la tarea programada "Voidtify servidor" al iniciar sesion. Sin
REM esto, tras cada reinicio la tarea de captura seguia disparandose puntual
REM cada 20 minutos contra un puerto muerto: la ventana parpadeaba igual y no
REM se guardaba nada, asi que la captura moria en silencio hasta acordarse de
REM arrancar el servidor a mano.
REM
REM Arranca en PRODUCCION. El modo desarrollo sirve 3,7 MB de JavaScript sin
REM minificar y recompila cada ruta la primera vez que se pide; produccion
REM sirve 653 KB ya compilados y responde el HTML tres veces mas rapido. Por un
REM tunel y desde un telefono esa diferencia se nota en cada pantalla, y esta
REM es la via por la que la app queda levantada para usarla.
REM
REM Para desarrollar, con recarga en caliente:  npm run dev
REM
REM Comprueba el puerto antes de arrancar porque el disparador de inicio de
REM sesion se repite: bloquear y desbloquear la sesion lo vuelve a lanzar, y
REM sin la comprobacion acabariamos con dos servidores sobre la misma base.

setlocal

set "PUERTO=3210"

REM curl sale con 0 si algo responde, con 7 si el puerto esta muerto. Da igual
REM que la respuesta sea un 307 hacia /biblioteca: lo que importa es que hay
REM alguien al otro lado.
curl.exe -s -o nul --max-time 5 http://127.0.0.1:%PUERTO%/
if not errorlevel 1 (
  echo Ya habia un servidor escuchando en el %PUERTO%. No hago nada.
  exit /b 0
)

cd /d "%~dp0.."

REM Se compila antes de arrancar. Con el cache de Turbopack son unos segundos
REM cuando no ha cambiado nada, y si falla es mejor no arrancar que servir una
REM version a medias sin que nadie se entere.
echo [%date% %time%] Compilando para produccion... >> "data\servidor.log"
call npm run build >> "data\servidor.log" 2>&1
if errorlevel 1 (
  echo [%date% %time%] La compilacion fallo. No se arranca. >> "data\servidor.log"
  exit /b 1
)

echo [%date% %time%] Arrancando en el %PUERTO%... >> "data\servidor.log"
call npm run start >> "data\servidor.log" 2>&1

echo [%date% %time%] El servidor termino con codigo %errorlevel%. >> "data\servidor.log"

endlocal
