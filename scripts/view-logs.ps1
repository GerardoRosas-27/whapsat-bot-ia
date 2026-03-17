# Script para ver los logs del servidor
# Uso: .\scripts\view-logs.ps1 [número de líneas]

param(
    [int]$Lines = 50
)

$logFile = "logs\server.log"

if (Test-Path $logFile) {
    Write-Host "=== Últimas $Lines líneas del log ===" -ForegroundColor Green
    Write-Host ""
    Get-Content $logFile -Tail $Lines
    Write-Host ""
    Write-Host "=== Fin del log ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Para ver todas las líneas relacionadas con DELETE, ejecuta:" -ForegroundColor Yellow
    Write-Host "Get-Content logs\server.log | Select-String '[DELETE]'" -ForegroundColor Cyan
} else {
    Write-Host "El archivo de logs no existe aún." -ForegroundColor Red
    Write-Host "Asegúrate de que el servidor esté ejecutándose y que hayas intentado eliminar una cita." -ForegroundColor Yellow
}
