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

    schtasks /Delete /TN $Nombre /F 2>$null | Out-Null
    schtasks /Create /TN $Nombre /XML $tmp /F
    Remove-Item $tmp -Force
}

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

Write-Host ''
Write-Host 'Listo. Estado de las dos tareas:' -ForegroundColor Green
Get-ScheduledTask -TaskName 'Voidtify *' |
    Select-Object TaskName, State,
        @{n='Bateria'; e={ if ($_.Settings.DisallowStartIfOnBatteries) { 'NO corre' } else { 'corre' } }},
        @{n='Recupera'; e={ $_.Settings.StartWhenAvailable }} |
    Format-Table -AutoSize
