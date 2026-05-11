Write-Host "Limpiando procesos del dashboard y sesión WhatsApp del bot de mochilas..."

$projectPath = (Resolve-Path "$PSScriptRoot\..").Path
$authPath = Join-Path $projectPath ".wwebjs_auth_backpack"
$sessionPath = Join-Path $authPath "session"
$devToolsFile = Join-Path $sessionPath "DevToolsActivePort"

$processes = Get-CimInstance Win32_Process | Where-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return $false }

  $isBackpackChrome = $cmd -like "*$authPath*" -or $cmd -like "*wwebjs_auth_backpack*"
  $isProjectNext =
    ($cmd -like "*$projectPath*" -and $cmd -like "*next*dev*") -or
    ($cmd -like "*npm-cli.js*run dev*" -and $_.ExecutablePath -like "*node*")
  $isBackpackBot =
    ($cmd -like "*$projectPath*" -and $cmd -like "*backpack-bot*")

  return $isBackpackChrome -or $isProjectNext -or $isBackpackBot
}

if ($processes.Count -eq 0) {
  Write-Host "No encontré procesos del bot/dash usando esta sesión."
} else {
  foreach ($proc in $processes) {
    try {
      Write-Host "Cerrando PID $($proc.ProcessId): $($proc.Name)"
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    } catch {
      Write-Warning "No pude cerrar PID $($proc.ProcessId): $($_.Exception.Message)"
    }
  }
}

if (Test-Path $devToolsFile) {
  try {
    Remove-Item $devToolsFile -Force
    Write-Host "Eliminado lock: $devToolsFile"
  } catch {
    Write-Warning "No pude eliminar DevToolsActivePort: $($_.Exception.Message)"
  }
}

Write-Host "Listo. Ahora puedes correr: npm run dev"
