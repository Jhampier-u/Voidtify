# Instala las dos tareas programadas de Voidtify.
#
#   Voidtify servidor  -> levanta el servidor al iniciar sesion
#   Voidtify captura   -> dispara una captura cada 20 minutos
#
# Ejecutar en una consola de ADMINISTRADOR:
#
#   powershell -ExecutionPolicy Bypass -File C:\Voidtify\scripts\instalar-tareas.ps1
#
# Hace falta administrador solo porque la version original de "Voidtify captura"
# se creo con permisos elevados y quedo siendo propiedad del grupo
# Administradores: el usuario normal ya no puede ni modificarla ni borrarla.
# Este script la reemplaza por una equivalente pero mejor configurada.
#
# Es idempotente: se puede ejecutar las veces que haga falta.

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$usuario = "$env:USERDOMAIN\$env:USERNAME"

# Los ajustes que arreglan los tres fallos que tenia la tarea original:
#
#   DisallowStartIfOnBatteries=false  corria solo con el portatil enchufado, y
#                                     en bateria dejaba de capturar en silencio
#   StopIfGoingOnBatteries=false      la mataba a mitad si se desenchufaba
#   StartWhenAvailable=true           si el equipo estaba apagado a la hora
#                                     exacta, esperaba al siguiente multiplo de
#                                     20 minutos en vez de recuperarla
#
# La accion pasa por oculto.vbs: es lo que evita la ventana de consola que
# aparecia cada 20 minutos.
$plantilla = @'
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>__DESC__</Description></RegistrationInfo>
  <Triggers>__TRIGGER__</Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>__USUARIO__</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>__LIMITE__</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>C:\Windows\System32\wscript.exe</Command>
      <Arguments>"__RAIZ__\scripts\oculto.vbs" "__RAIZ__\scripts\__SCRIPT__"</Arguments>
    </Exec>
  </Actions>
</Task>
'@

function Nueva-Tarea {
    param($Nombre, $Descripcion, $Disparador, $Limite, $Script)

    $xml = $plantilla.
        Replace('__DESC__',     $Descripcion).
        Replace('__TRIGGER__',  $Disparador).
        Replace('__USUARIO__',  $usuario).
        Replace('__LIMITE__',   $Limite).
        Replace('__RAIZ__',     $raiz).
        Replace('__SCRIPT__',   $Script)

    $tmp = Join-Path $env:TEMP "voidtify-$Script.xml"
    # UTF-16 con BOM: es lo que espera el Programador de tareas.
    $xml | Out-File -FilePath $tmp -Encoding Unicode

    # Solo se borra si existe: `schtasks /Delete` sobre una tarea inexistente
    # escribe en stderr, y con $ErrorActionPreference = 'Stop' eso aborta el
    # script entero en la primera instalacion limpia.
    #
    # Y todo va en try/catch porque una tarea creada en su dia con permisos
    # elevados queda en manos del grupo Administradores: sin esto, el script
    # muere en la primera y no llega a instalar las demas.
    try {
        if (Get-ScheduledTask -TaskName $Nombre -ErrorAction SilentlyContinue) {
            schtasks /Delete /TN $Nombre /F 2>$null | Out-Null
        }
        schtasks /Create /TN $Nombre /XML $tmp /F | Out-Null
        Write-Host "  $Nombre : instalada"
    } catch {
        Write-Host "  $Nombre : NO se pudo (hace falta administrador)" -ForegroundColor Yellow
        $script:pendientes += $Nombre
    }
    Remove-Item $tmp -Force
}

$pendientes = @()

# El servidor no lleva limite de ejecucion (PT0S): esta pensado para no parar
# nunca. Con MultipleInstancesPolicy=IgnoreNew, volver a iniciar sesion no
# arranca un segundo servidor sobre la misma base de datos.
Nueva-Tarea `
    -Nombre      'Voidtify servidor' `
    -Descripcion 'Voidtify: levanta el servidor al iniciar sesion, para que la captura tenga a quien llamar tras un reinicio.' `
    -Disparador  "<LogonTrigger><Enabled>true</Enabled><UserId>$usuario</UserId><Delay>PT20S</Delay></LogonTrigger>" `
    -Limite      'PT0S' `
    -Script      'servidor.cmd'

# Repeticion sin <Duration>, que en este formato significa indefinida.
Nueva-Tarea `
    -Nombre      'Voidtify captura' `
    -Descripcion 'Voidtify: dispara una captura de escuchas recientes cada 20 minutos. Sin ventana.' `
    -Disparador  '<TimeTrigger><Repetition><Interval>PT20M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2026-07-27T17:37:00</StartBoundary><Enabled>true</Enabled></TimeTrigger>' `
    -Limite      'PT10M' `
    -Script      'capture.cmd'

# Diaria. Con StartWhenAvailable no importa que el equipo este apagado a esa
# hora: la recupera al encender. Es la razon de que no haga falta acertar con
# un horario.
Nueva-Tarea `
    -Nombre      'Voidtify copia' `
    -Descripcion 'Voidtify: copia de seguridad diaria de la base de escuchas, comprimida y verificada.' `
    -Disparador  '<CalendarTrigger><StartBoundary>2026-08-25T21:00:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>' `
    -Limite      'PT30M' `
    -Script      'copia-seguridad.cmd'

Write-Host ''
Write-Host 'Retirando la tarea huerfana del dashboard...' -ForegroundColor Cyan

# "Juampi captura" quedo apuntando a un script que ya no existe: cuando musica
# salio del dashboard se llevo consigo capture.cmd y la ruta /api/cron/capture.
# Cada 20 minutos dejaba un wscript esperando en un cuadro de error invisible,
# porque la tarea corre oculta.
#
# "Juampi servidor" NO se toca: el dashboard sigue vivo y lo sigue necesitando.
if (Get-ScheduledTask -TaskName 'Juampi captura' -ErrorAction SilentlyContinue) {
    # try/catch porque sin administrador `schtasks` escribe en stderr, y eso
    # con $ErrorActionPreference = 'Stop' abortaria el script justo antes de
    # explicar que hace falta elevar.
    try { schtasks /End    /TN 'Juampi captura'    2>$null | Out-Null } catch {}
    try { schtasks /Delete /TN 'Juampi captura' /F 2>$null | Out-Null } catch {}
    if (Get-ScheduledTask -TaskName 'Juampi captura' -ErrorAction SilentlyContinue) {
        Write-Host '  Juampi captura : NO se pudo retirar' -ForegroundColor Yellow
        $pendientes += 'Juampi captura'
    } else {
        Write-Host '  Juampi captura : retirada'
    }
} else {
    Write-Host '  Juampi captura : ya no existe'
}

if ($pendientes) {
    Write-Host ''
    Write-Host 'Vuelve a ejecutar este script COMO ADMINISTRADOR para:' -ForegroundColor Yellow
    $pendientes | Sort-Object -Unique | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    Write-Host 'Las tareas son propiedad del grupo Administradores y un usuario normal no puede borrarlas.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Estado de las tareas:' -ForegroundColor Green
Get-ScheduledTask -TaskName 'Voidtify *', 'Juampi *' -ErrorAction SilentlyContinue |
    Select-Object TaskName, State,
        @{n='Bateria'; e={ if ($_.Settings.DisallowStartIfOnBatteries) { 'NO corre' } else { 'corre' } }},
        @{n='Recupera'; e={ $_.Settings.StartWhenAvailable }} |
    Format-Table -AutoSize
