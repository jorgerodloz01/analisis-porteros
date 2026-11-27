# Escribe en la tabla tblWellness (hoja WELLNESS) las filas que le pasa sincronizar.mjs, usando el propio Excel.
# No toca fórmulas, formatos ni gráficos: rellena las mismas celdas que rellenarías a mano.
param(
  [Parameter(Mandatory = $true)][string]$Libro,
  [Parameter(Mandatory = $true)][string]$Datos,
  [switch]$Simular
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Salir($obj, $code) { Write-Output ($obj | ConvertTo-Json -Compress -Depth 4); exit $code }

if (-not (Test-Path -LiteralPath $Libro)) { Salir @{ error = "No encuentro el Excel: $Libro" } 3 }
if (-not $Simular) {
  try { $fs = [IO.File]::Open($Libro, 'Open', 'ReadWrite', 'None'); $fs.Close() }
  catch { Salir @{ error = 'El Excel de monitorización está abierto. Ciérralo y vuelve a ejecutar.' } 2 }
}

# -InputObject: en Windows PowerShell 5.1 un array JSON por tubería llega como un solo objeto.
$filas = ConvertFrom-Json -InputObject (Get-Content -Raw -Encoding UTF8 -LiteralPath $Datos)
if ($filas -eq $null) { $filas = @() }
$es = [Globalization.CultureInfo]::GetCultureInfo('es-ES')
$xl = $null; $wb = $null
try {
  $xl = New-Object -ComObject Excel.Application
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false
  $wb = $xl.Workbooks.Open($Libro, 0, [bool]$Simular)
  $lo = $wb.Worksheets.Item('WELLNESS').ListObjects.Item('tblWellness')

  # Columnas por su título (así da igual si algún día se mueven).
  $col = @{}
  $hdr = $lo.HeaderRowRange.Value2
  for ($c = 1; $c -le $lo.ListColumns.Count; $c++) { $col[[string]$hdr[1, $c]] = $c }
  $campos = [ordered]@{ sueno = 'Calidad del sueño'; horas = 'Horas de sueño'; fatigaFisica = 'Fatiga física'; fatigaMental = 'Fatiga mental';
    estres = 'Estrés'; dolor = 'Dolor muscular'; tiesura = 'Tiesura general'; observaciones = 'Observaciones' }
  foreach ($t in @('Fecha', 'Portero') + @($campos.Values)) { if (-not $col.ContainsKey($t)) { Salir @{ error = "En la tabla tblWellness falta la columna «$t»." } 4 } }
  $cEscalas = @('Calidad del sueño', 'Fatiga física', 'Fatiga mental', 'Estrés', 'Dolor muscular', 'Tiesura general') | ForEach-Object { $col[$_] }

  # Lo que ya hay: fecha|portero → fila (y si tiene datos o es un día preparado vacío); filas totalmente libres.
  $mapa = @{}; $libres = New-Object System.Collections.Generic.List[int]
  $body = $lo.DataBodyRange
  $n = 0; if ($body -ne $null) { $n = $body.Rows.Count; $v = $body.Value2 }
  for ($i = 1; $i -le $n; $i++) {
    $f = $v[$i, $col['Fecha']]; $p = [string]$v[$i, $col['Portero']]
    if ($f -eq $null -or [string]$f -eq '') { if ($p.Trim() -eq '') { $libres.Add($i) }; continue }
    try { if ($f -is [double]) { $d = [DateTime]::FromOADate($f) } else { $d = [DateTime]::Parse([string]$f, $es) } } catch { continue }
    $tiene = $false
    foreach ($c in $cEscalas) { if ($v[$i, $c] -ne $null -and [string]$v[$i, $c] -ne '') { $tiene = $true } }
    $mapa[$d.ToString('yyyy-MM-dd') + '|' + $p.Trim().ToLower()] = @{ fila = $i; tiene = $tiene }
  }

  $anadidas = 0; $rellenadas = 0; $yaEstaban = 0; $fechas = @()
  foreach ($r in $filas) {
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
      if ($valor -ne $null -and [string]$valor -ne '') { $body.Cells.Item($i, $col[$kv.Value]).Value2 = $valor }
    }
    $mapa[$k] = @{ fila = $i; tiene = $true }
  }
  if (-not $Simular -and ($anadidas + $rellenadas) -gt 0) { $wb.Save() }
  Salir @{ anadidas = $anadidas; rellenadas = $rellenadas; yaEstaban = $yaEstaban; fechas = $fechas; simulado = [bool]$Simular } 0
}
catch { Salir @{ error = "Excel: $($_.Exception.Message)" } 1 }
finally {
  if ($wb -ne $null) { $wb.Close($false) | Out-Null }
  if ($xl -ne $null) { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
