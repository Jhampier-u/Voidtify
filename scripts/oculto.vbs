' Lanza un comando sin ventana y devuelve su codigo de salida.
'
' El Programador de tareas no sabe ocultar la consola de un .cmd cuando la
' tarea corre en la sesion interactiva: de ahi la ventana que aparecia cada 20
' minutos. La solucion nativa -- "ejecutar tanto si el usuario inicio sesion
' como si no" -- exige permisos de administrador que aqui no tenemos.
'
' WScript.Shell.Run con el estilo de ventana a 0 arranca el proceso oculto sin
' pedir nada a nadie.
'
' Uso: wscript.exe oculto.vbs "C:\ruta\al\script.cmd" [argumentos...]

Set args = WScript.Arguments
If args.Count = 0 Then
  WScript.Quit 1
End If

comando = """" & args(0) & """"
For i = 1 To args.Count - 1
  comando = comando & " """ & args(i) & """"
Next

Set sh = CreateObject("WScript.Shell")

' 0 = ventana oculta. True = esperar a que termine, para que el Programador de
' tareas reciba el codigo de salida real: sin esto toda ejecucion figuraria
' como correcta y el registro de la tarea dejaria de servir para diagnosticar.
WScript.Quit sh.Run(comando, 0, True)
