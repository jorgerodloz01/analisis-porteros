# Común a los scripts que abren el Excel por COM.
# 1) Filtro de mensajes OLE: si Excel está ocupado (recalculando) y rechaza una llamada (RPC_E_CALL_REJECTED),
#    en vez de fallar se reintenta cada 200 ms durante un máximo de 60 s. Es la solución estándar de Microsoft
#    para automatizar Office; necesita PowerShell en modo STA, que es el modo por defecto de powershell.exe.
# 2) Cálculo manual mientras se escribe: cada celda escrita no dispara el recálculo de todo el libro.
#    Antes de guardar se vuelve a automático (el modo de cálculo se guarda en el archivo).
if (-not ('FiltroMensajesOle' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("00000016-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IOleMessageFilterPorteros {
  [PreserveSig] int HandleInComingCall(int dwCallType, IntPtr hTaskCaller, int dwTickCount, IntPtr lpInterfaceInfo);
  [PreserveSig] int RetryRejectedCall(IntPtr hTaskCallee, int dwTickCount, int dwRejectType);
  [PreserveSig] int MessagePending(IntPtr hTaskCallee, int dwTickCount, int dwPendingType);
}
public class FiltroMensajesOle : IOleMessageFilterPorteros {
  [DllImport("Ole32.dll")] private static extern int CoRegisterMessageFilter(IOleMessageFilterPorteros nuevo, out IOleMessageFilterPorteros viejo);
  public static void Registrar() { IOleMessageFilterPorteros viejo; CoRegisterMessageFilter(new FiltroMensajesOle(), out viejo); }
  public static void Quitar() { IOleMessageFilterPorteros viejo; CoRegisterMessageFilter(null, out viejo); }
  public int HandleInComingCall(int a, IntPtr b, int c, IntPtr d) { return 0; }
  public int RetryRejectedCall(IntPtr h, int ms, int tipo) { return (ms < 60000) ? 200 : -1; }
  public int MessagePending(IntPtr h, int ms, int tipo) { return 2; }
}
"@
}
[FiltroMensajesOle]::Registrar()

$XL_CALCULO_MANUAL = -4135
$XL_CALCULO_AUTOMATICO = -4105
function Guardar-Libro($xl, $wb) {
  $xl.Calculation = $XL_CALCULO_AUTOMATICO
  $xl.Calculate()
  $wb.Save()
}
