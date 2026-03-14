# Script de configuración para Windows PowerShell

Write-Host "🚀 Configurando el sistema de agendamiento..." -ForegroundColor Cyan

# Verificar si existe .env
if (-not (Test-Path .env)) {
    Write-Host "📝 Creando archivo .env..." -ForegroundColor Yellow
    
    # Generar JWT secret aleatorio
    $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    
    @"
# Database
DATABASE_URL="file:./dev.db"

# JWT Secret (cambia esto en producción)
JWT_SECRET="$jwtSecret"

# Admin credentials (cambia estos valores)
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"

# WhatsApp Bot
BOT_PHONE_NUMBER=""
"@ | Out-File -FilePath .env -Encoding UTF8
    
    Write-Host "✅ Archivo .env creado" -ForegroundColor Green
} else {
    Write-Host "⚠️  El archivo .env ya existe" -ForegroundColor Yellow
}

# Instalar dependencias
Write-Host "📦 Instalando dependencias..." -ForegroundColor Yellow
npm install

# Ejecutar migraciones
Write-Host "🗄️  Ejecutando migraciones de base de datos..." -ForegroundColor Yellow
npx prisma migrate dev --name init

# Inicializar base de datos
Write-Host "👤 Creando usuario admin..." -ForegroundColor Yellow
npx tsx scripts/init-db.ts

Write-Host ""
Write-Host "✅ Configuración completada!" -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar el servidor web:" -ForegroundColor Cyan
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Para iniciar el bot de WhatsApp (en otra terminal):" -ForegroundColor Cyan
Write-Host "  npm run bot"
Write-Host ""
