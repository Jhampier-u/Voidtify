@echo off
REM Para el servidor que arranco la tarea programada.
REM
REM Existe porque ese servidor corre sin ventana: no aparece en ninguna
REM consola, asi que no hay un Ctrl+C con el que matarlo.

REM Primero se cierra la instancia de la tarea. Matar solo el proceso de node
REM deja vivo el envoltorio (wscript y cmd), asi que la tarea sigue figurando
REM como "en ejecucion" y, con MultipleInstancesPolicy=IgnoreNew, el siguiente
REM intento de arrancarla se descarta en silencio.
schtasks /End /TN "Voidtify servidor" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue;" ^
  "if (-not $c) { 'No hay ningun servidor escuchando en el 3210.'; exit }" ^
  "$c | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {" ^
  "  Stop-Process -Id $_ -Force; 'Parado el proceso ' + $_ }"
