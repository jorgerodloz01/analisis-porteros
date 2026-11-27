# Escribe en la tabla tblCarga (hoja CARGA Y READINESS) el RPE de los porteros con los datos de la sesión, usando el propio Excel.
# Solo rellena celdas vacías: lo que ya hay escrito a mano no se toca. sRPE, ACWR, etc. los calculan las fórmulas del Excel.
param(
  [Parameter(Mandatory = $true)][string]$Libro,
  [Parameter(Mandatory = $true)][string]$Datos,
  [switch]$Simular,
  [switch]$Todo   # sin él, solo días desde el último que ya tiene RPE
)
# ConvertFrom-Json (Windows PowerShell 5.1) da los decimales como [decimal] y Excel no los acepta por COM: van como [double].
function Valor($v) { if ($v -is [string] -or $v -is [bool]) { return $v }; return [double]$v }
function Poner($celda, $valor, $que) {
  $v = Valor $valor
  try { $celda.Value2 = $v } catch { throw "No pude escribir «$que» = '$valor' ($($valor.GetType().Name)): $($_.Exception.Message)" }
}
. (Join-Path $PSScriptRoot 'excel-com.ps1')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$resultado = $null; $codigo = 0; $xl = $null; $wb = $null; $copia = $null
$MSG_ABIERTO = 'El Excel de monitorización está abierto. Ciérralo y vuelve a ejecutar. Si no lo tienes abierto, se ha quedado un Excel en segundo plano: ciérralo con  Get-Process EXCEL | Where-Object { $_.MainWindowHandle -eq 0 } | Stop-Process'
try {
  if (-not (Test-Path -LiteralPath $Libro)) { throw "No encuentro el Excel: $Libro" }
  $abrir = $Libro
  if ($Simular) {
    # La simulación trabaja sobre una copia: funciona aunque el Excel esté abierto y nunca toca el original.
    $copia = Join-Path $env:TEMP ('simulacion-' + [guid]::NewGuid().ToString() + '.xlsx')
    Copy-Item -LiteralPath $Libro -Destination $copia
    $abrir = $copia
  } else {
    try { $fs = [IO.File]::Open($Libro, 'Open', 'ReadWrite', 'None'); $fs.Close() } catch { $codigo = 2; throw $MSG_ABIERTO }
  }
  $xl = New-Object -ComObject Excel.Application
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false
  $wb = $xl.Workbooks.Open($abrir, 0, $false)
  if ($wb -eq $null) { $codigo = 2; throw $MSG_ABIERTO }
  $xl.Calculation = $XL_CALCULO_MANUAL

  $filas = ConvertFrom-Json -InputObject (Get-Content -Raw -Encoding UTF8 -LiteralPath $Datos)
  if ($filas -eq $null) { $filas = @() }
  $es = [Globalization.CultureInfo]::GetCultureInfo('es-ES')
  $lo = $wb.Worksheets.Item('CARGA Y READINESS').ListObjects.Item('tblCarga')

  $col = @{}
  $hdr = $lo.HeaderRowRange.Value2
  for ($c = 1; $c -le $lo.ListColumns.Count; $c++) { $col[[string]$hdr[1, $c]] = $c }
  $campos = [ordered]@{ microciclo = 'Microciclo'; tipo = 'Tipo de sesión'; duracion = 'Duración (min)'; rpe = 'RPE'; observaciones = 'Observaciones' }
  foreach ($t in @('Nº de sesión', 'Fecha', 'Portero') + @($campos.Values)) { if (-not $col.ContainsKey($t)) { throw "En la tabla tblCarga falta la columna «$t»." } }

  $mapa = @{}; $sesionDe = @{}; $maxSesion = 0; $ultimoDia = $null
  $libres = New-Object System.Collections.Generic.List[int]
  $body = $lo.DataBodyRange
  $n = 0; if ($body -ne $null) { $n = $body.Rows.Count; $v = $body.Value2 }
  for ($i = 1; $i -le $n; $i++) {
    $f = $v[$i, $col['Fecha']]; $p = [string]$v[$i, $col['Portero']]
    if ($f -eq $null -or [string]$f -eq '') { if ($p.Trim() -eq '') { $libres.Add($i) }; continue }
    try { if ($f -is [double]) { $d = [DateTime]::FromOADate($f) } else { $d = [DateTime]::Parse([string]$f, $es) } } catch { continue }
    $dia = $d.ToString('yyyy-MM-dd')
    $mapa[$dia + '|' + $p.Trim().ToLower()] = $i
    $ns = $v[$i, $col['Nº de sesión']]
    if ($ns -is [double]) { $sesionDe[$dia] = $ns; if ($ns -gt $maxSesion) { $maxSesion = $ns } }
    $r = $v[$i, $col['RPE']]
    if ($r -ne $null -and [string]$r -ne '' -and ($ultimoDia -eq $null -or $dia -gt $ultimoDia)) { $ultimoDia = $dia }
  }

  $anadidas = 0; $completadas = 0; $yaEstaban = 0; $anteriores = 0; $fechas = @()
  foreach ($r in $filas) {
    if (-not $Todo -and $ultimoDia -ne $null -and $r.fecha -lt $ultimoDia) { $anteriores++; continue }
    $k = $r.fecha + '|' + ([string]$r.portero).Trim().ToLower()
    $body = $lo.DataBodyRange
    if ($mapa.ContainsKey($k)) {
      $i = $mapa[$k]; $huecos = 0
      foreach ($kv in $campos.GetEnumerator()) {
        $valor = $r.($kv.Key); $celda = $body.Cells.Item($i, $col[$kv.Value])
        if ($valor -ne $null -and [string]$valor -ne '' -and [string]$celda.Value2 -eq '') { $huecos++; if (-not $Simular) { Poner $celda $valor $kv.Value } }
      }
      if ($huecos -gt 0) { $completadas++; $fechas += "$($r.fecha) $($r.portero) (completada)" } else { $yaEstaban++ }
      continue
    }
    if ($libres.Count -gt 0) { $i = $libres[0]; $libres.RemoveAt(0) }
    else { if (-not $Simular) { $null = $lo.ListRows.Add(); $body = $lo.DataBodyRange; $i = $body.Rows.Count } else { $i = -1 } }
    if (-not $sesionDe.ContainsKey($r.fecha)) { $maxSesion++; $sesionDe[$r.fecha] = $maxSesion }
    $anadidas++; $fechas += "$($r.fecha) $($r.portero) · sesión $($sesionDe[$r.fecha]) · RPE $($r.rpe)"
    $mapa[$k] = $i
    if ($Simular) { continue }
    $body.Cells.Item($i, $col['Nº de sesión']).Value2 = $sesionDe[$r.fecha]
    $body.Cells.Item($i, $col['Fecha']).Value2 = [DateTime]::ParseExact($r.fecha, 'yyyy-MM-dd', $es).ToOADate()
    $body.Cells.Item($i, $col['Portero']).Value2 = [string]$r.portero
    foreach ($kv in $campos.GetEnumerator()) {
      $valor = $r.($kv.Key)
      if ($valor -ne $null -and [string]$valor -ne '') { $celda = $body.Cells.Item($i, $col[$kv.Value]); Poner $celda $valor $kv.Value }
    }
  }
  if (-not $Simular -and ($anadidas + $completadas) -gt 0) { Guardar-Libro $xl $wb }
  $resultado = @{ anadidas = $anadidas; completadas = $completadas; yaEstaban = $yaEstaban; anteriores = $anteriores; ultimoDia = $ultimoDia; fechas = $fechas; simulado = [bool]$Simular }
}
catch {
  if ($codigo -eq 0) { $codigo = 1 }
  $msg = $_.Exception.Message
  if ($codigo -eq 1) { $msg = "Excel (línea $($_.InvocationInfo.ScriptLineNumber)): $msg" }
  $resultado = @{ error = $msg }
}
finally {
  if ($wb -ne $null) { try { $wb.Close($false) } catch { } }
  if ($xl -ne $null) { try { $xl.Quit() } catch { }; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
  try { [FiltroMensajesOle]::Quitar() } catch { }
  $wb = $null; $xl = $null
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  if ($copia) { Remove-Item -LiteralPath $copia -ErrorAction SilentlyContinue }
}
Write-Output ($resultado | ConvertTo-Json -Compress -Depth 4)
exit $codigo
