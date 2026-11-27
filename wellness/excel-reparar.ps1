# Reintroduce las fórmulas con TAKE y AGGREGATE del Excel (el archivo las trae grabadas como _xludf.TAKE y Excel las da por error,
# que el IFERROR esconde dejando el DASHBOARD en blanco). Si este Excel no tiene TAKE, la cambia por INDEX(...;FILAS(...)).
param([Parameter(Mandatory = $true)][string]$Libro, [string]$Porteros = '')
$Simular = $false
# TAKE(X,-1) → INDEX(X,ROWS(X)) respetando paréntesis y comillas. Si el segundo argumento no es -1, no lo toca.
function Sin-Take([string]$f) {
  $desde = 0
  while (($ini = $f.IndexOf('TAKE(', $desde)) -ge 0) {
    $prof = 0; $comillas = $false; $coma = -1; $fin = -1
    for ($j = $ini + 4; $j -lt $f.Length; $j++) {
      $ch = $f[$j]
      if ($ch -eq '"') { $comillas = -not $comillas; continue }
      if ($comillas) { continue }
      if ($ch -eq '(') { $prof++ } elseif ($ch -eq ')') { $prof--; if ($prof -eq 0) { $fin = $j; break } }
      elseif ($ch -eq ',' -and $prof -eq 1 -and $coma -lt 0) { $coma = $j }
    }
    if ($fin -lt 0 -or $coma -lt 0) { return $null }
    $x = $f.Substring($ini + 5, $coma - $ini - 5); $n = $f.Substring($coma + 1, $fin - $coma - 1).Trim()
    if ($n -ne '-1') { $desde = $fin; continue }
    $f = $f.Substring(0, $ini) + "INDEX($x,ROWS($x))" + $f.Substring($fin + 1)
  }
  return $f
}

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
  $prueba = $wb.Worksheets.Add()
  $prueba.Range('A1').Formula2 = '=TAKE({1;2},-1)'
  $xl.Calculate()
  $pv = $prueba.Range('A1').Value2
  $tieneTake = ($pv -is [double] -and $pv -eq 2)
  $prueba.Delete()

  $celdas = New-Object System.Collections.Generic.List[object]
  # Funciones que el archivo trae grabadas como _xludf.* (Excel las da por error): TAKE en el DASHBOARD, AGGREGATE en FUERZA.
  $vistas = @{}
  foreach ($ws in $wb.Worksheets) {
    $usado = $ws.UsedRange
    foreach ($termino in @('TAKE(', 'AGGREGATE(')) {
      $primera = $usado.Find($termino, [Type]::Missing, -4123, 2)   # xlFormulas, xlPart
      if ($primera -eq $null) { continue }
      $dir = $primera.Address(); $c = $primera
      do {
        $clave = $ws.Name + '!' + $c.Address()
        if (-not $vistas.ContainsKey($clave)) { $vistas[$clave] = $true; $celdas.Add($c) }
        $c = $usado.FindNext($c)
      } while ($c -ne $null -and $c.Address() -ne $dir)
    }
  }
  $cambiadas = 0; $sinCambiar = 0
  foreach ($c in $celdas) {
    $f = ([string]$c.Formula2).Replace('_xludf.', '')
    if (-not $tieneTake) { $f = Sin-Take $f }
    if ($f -eq $null) { $sinCambiar++; continue }
    $c.Formula2 = $f; $cambiadas++
  }
  # Porteros en CONFIG (columna A desde la fila 2), sin repetir ni tocar los que ya están.
  $cfg = $wb.Worksheets.Item('CONFIG'); $fila = 2; $existentes = @(); $anadidos = @()
  while ([string]$cfg.Cells.Item($fila, 1).Value2 -ne '') { $existentes += [string]$cfg.Cells.Item($fila, 1).Value2; $fila++ }
  foreach ($p in ($Porteros -split '\|')) {
    if ($p -and -not ($existentes -contains $p)) { $cfg.Cells.Item($fila, 1).Value2 = $p; $fila++; $anadidos += $p }
  }
  if ($cambiadas -gt 0 -or $anadidos.Count -gt 0) { $wb.Save() }
  $resultado = @{ cambiadas = $cambiadas; sinCambiar = $sinCambiar; tieneTake = $tieneTake; anadidos = $anadidos }
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
  $wb = $null; $xl = $null
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  if ($copia) { Remove-Item -LiteralPath $copia -ErrorAction SilentlyContinue }
}
Write-Output ($resultado | ConvertTo-Json -Compress -Depth 4)
exit $codigo
