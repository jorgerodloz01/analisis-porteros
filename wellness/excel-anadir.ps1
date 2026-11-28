# Escribe en la tabla tblWellness (hoja WELLNESS) las filas que le pasa sincronizar.mjs, usando el propio Excel.
# No toca fórmulas, formatos ni gráficos: rellena las mismas celdas que rellenarías a mano.
param(
  [Parameter(Mandatory = $true)][string]$Libro,
  [Parameter(Mandatory = $true)][string]$Datos,
  [switch]$Simular,
  [switch]$Todo   # sin él, solo se escriben días desde el último que ya tiene datos (la historia escrita a mano no se toca)
)
# Lo que sale de ConvertFrom-Json llega «envuelto» (PSObject) y Excel lo rechaza por COM con «La conversión especificada
# no es válida». Con un cast explícito llega el valor tal cual: texto → [string], número → [double].
function Valor($v) { if ($v -is [string]) { return [string]$v }; if ($v -is [bool]) { return [bool]$v }; return [double]$v }
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

  # -InputObject: en Windows PowerShell 5.1 un array JSON por tubería llega como un solo objeto.
  $filas = ConvertFrom-Json -InputObject (Get-Content -Raw -Encoding UTF8 -LiteralPath $Datos)
  if ($filas -eq $null) { $filas = @() }
  $es = [Globalization.CultureInfo]::GetCultureInfo('es-ES')
  $lo = $wb.Worksheets.Item('WELLNESS').ListObjects.Item('tblWellness')

  # Columnas por su título (así da igual si algún día se mueven).
  $col = @{}
  $hdr = $lo.HeaderRowRange.Value2
  for ($c = 1; $c -le $lo.ListColumns.Count; $c++) { $col[[string]$hdr[1, $c]] = $c }
  $campos = [ordered]@{ sueno = 'Calidad del sueño'; horas = 'Horas de sueño'; fatigaFisica = 'Fatiga física'; fatigaMental = 'Fatiga mental';
    estres = 'Estrés'; dolor = 'Dolor muscular'; tiesura = 'Tiesura general'; observaciones = 'Observaciones' }
  foreach ($t in @('Fecha', 'Portero') + @($campos.Values)) { if (-not $col.ContainsKey($t)) { throw "En la tabla tblWellness falta la columna «$t»." } }
  $cEscalas = @('Calidad del sueño', 'Fatiga física', 'Fatiga mental', 'Estrés', 'Dolor muscular', 'Tiesura general') | ForEach-Object { $col[$_] }

  # Lo que ya hay: fecha|portero → fila (y si tiene datos o es un día preparado vacío); filas totalmente libres.
  $mapa = @{}; $libres = New-Object System.Collections.Generic.List[int]; $ultimoDia = $null
  $body = $lo.DataBodyRange
  $n = 0; if ($body -ne $null) { $n = $body.Rows.Count; $v = $body.Value2 }
  for ($i = 1; $i -le $n; $i++) {
    $f = $v[$i, $col['Fecha']]; $p = [string]$v[$i, $col['Portero']]
    if ($f -eq $null -or [string]$f -eq '') { if ($p.Trim() -eq '') { $libres.Add($i) }; continue }
    try { if ($f -is [double]) { $d = [DateTime]::FromOADate($f) } else { $d = [DateTime]::Parse([string]$f, $es) } } catch { continue }
    $tiene = $false
    foreach ($c in $cEscalas) { if ($v[$i, $c] -ne $null -and [string]$v[$i, $c] -ne '') { $tiene = $true } }
    $dia = $d.ToString('yyyy-MM-dd')
    $mapa[$dia + '|' + $p.Trim().ToLower()] = @{ fila = $i; tiene = $tiene }
    if ($tiene -and ($ultimoDia -eq $null -or $dia -gt $ultimoDia)) { $ultimoDia = $dia }
  }

  $anadidas = 0; $rellenadas = 0; $yaEstaban = 0; $anteriores = 0; $fechas = @()
  foreach ($r in $filas) {
    if (-not $Todo -and $ultimoDia -ne $null -and $r.fecha -lt $ultimoDia) { $anteriores++; continue }
    $k = $r.fecha + '|' + ([string]$r.portero).Trim().ToLower()
    if ($mapa.ContainsKey($k) -and $mapa[$k].tiene) { $yaEstaban++; continue }
    if ($mapa.ContainsKey($k)) { $i = $mapa[$k].fila; $rellenadas++ }
    elseif ($libres.Count -gt 0) { $i = $libres[0]; $libres.RemoveAt(0); $anadidas++ }
    else { $null = $lo.ListRows.Add(); $body = $lo.DataBodyRange; $i = $body.Rows.Count; $anadidas++ }
    $fechas += "$($r.fecha) $($r.portero)"
    if ($Simular) { continue }
    $body = $lo.DataBodyRange
    $body.Cells.Item($i, $col['Fecha']).Value2 = [DateTime]::ParseExact($r.fecha, 'yyyy-MM-dd', $es).ToOADate()
    $body.Cells.Item($i, $col['Portero']).Value2 = [string]$r.portero
    foreach ($kv in $campos.GetEnumerator()) {
      $valor = $r.($kv.Key)
      if ($valor -ne $null -and [string]$valor -ne '') { $celda = $body.Cells.Item($i, $col[$kv.Value]); Poner $celda $valor $kv.Value }
    }
    $mapa[$k] = @{ fila = $i; tiene = $true }
  }
  if (-not $Simular -and ($anadidas + $rellenadas) -gt 0) { Guardar-Libro $xl $wb }
  $resultado = @{ anadidas = $anadidas; rellenadas = $rellenadas; yaEstaban = $yaEstaban; anteriores = $anteriores; ultimoDia = $ultimoDia; fechas = $fechas; simulado = [bool]$Simular }
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
