#!/bin/bash

echo "🚀 Configurando el sistema de agendamiento..."

# Verificar si existe .env
if [ ! -f .env ]; then
    echo "📝 Creando archivo .env..."
    cat > .env << EOF
# Database
DATABASE_URL="file:./dev.db"

# JWT Secret (cambia esto en producción)
JWT_SECRET="$(openssl rand -hex 32)"

# Admin credentials (cambia estos valores)
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"

# WhatsApp Bot
BOT_PHONE_NUMBER=""
EOF
    echo "✅ Archivo .env creado"
else
    echo "⚠️  El archivo .env ya existe"
fi

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Ejecutar migraciones
echo "🗄️  Ejecutando migraciones de base de datos..."
npx prisma migrate dev --name init

# Inicializar base de datos
echo "👤 Creando usuario admin..."
npx tsx scripts/init-db.ts

echo ""
echo "✅ Configuración completada!"
echo ""
echo "Para iniciar el servidor web:"
echo "  npm run dev"
echo ""
echo "Para iniciar el bot de WhatsApp (en otra terminal):"
echo "  npm run bot"
echo ""
