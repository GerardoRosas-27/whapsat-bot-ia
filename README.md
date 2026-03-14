# Sistema de Agendamiento de Citas de Psicología vía WhatsApp

Sistema completo para agendar citas de psicología a través de un bot de WhatsApp, con panel de administración web construido con Next.js y React.

## Características

- 🤖 Bot de WhatsApp automatizado para agendar citas
- 📱 Interfaz web de administración moderna
- 🔐 Sistema de autenticación seguro
- 📅 Gestión completa de citas (crear, editar, eliminar, filtrar)
- 📊 Dashboard con estado del bot en tiempo real
- 💾 Base de datos SQLite con Prisma

## Requisitos Previos

- Node.js 18+ 
- npm o yarn
- WhatsApp Web (para escanear el código QR)

## Instalación

1. Clona o descarga el proyecto

2. Instala las dependencias:
```bash
npm install
```

3. Configura las variables de entorno:
```bash
cp .env.example .env
```

Edita el archivo `.env` y configura:
- `DATABASE_URL`: URL de la base de datos (por defecto usa SQLite)
- `JWT_SECRET`: Clave secreta para JWT (cambia esto en producción)
- `ADMIN_USERNAME`: Usuario admin (por defecto: admin)
- `ADMIN_PASSWORD`: Contraseña admin (por defecto: admin123)

4. Inicializa la base de datos:
```bash
npx prisma migrate dev --name init
npx tsx scripts/init-db.ts
```

## Uso

### Iniciar el servidor web (Panel de Administración)

```bash
npm run dev
```

Abre tu navegador en `http://localhost:3000`

### Iniciar el Bot de WhatsApp

En una terminal separada:

```bash
npm run bot
```

1. Escanea el código QR que aparece en la terminal con WhatsApp
2. Una vez conectado, el bot estará listo para recibir mensajes

## Comandos del Bot de WhatsApp

Los usuarios pueden interactuar con el bot usando estos comandos:

- `hola` o `inicio` - Iniciar conversación
- `agendar` o `cita` - Agendar una nueva cita
  - Ejemplo: `agendar 15/01/2024 10:00`
- `mis citas` o `citas` - Ver citas programadas
- `cancelar` - Cancelar una cita
- `ayuda` o `help` - Mostrar ayuda

## Panel de Administración

### Login
- Usuario por defecto: `admin`
- Contraseña por defecto: `admin123`

**⚠️ IMPORTANTE:** Cambia estas credenciales después del primer inicio de sesión.

### Funcionalidades del Dashboard

- Ver todas las citas agendadas
- Filtrar por estado (Todas, Pendientes, Confirmadas, Canceladas, Completadas)
- Crear nuevas citas manualmente
- Editar citas existentes
- Eliminar citas
- Ver estado del bot de WhatsApp en tiempo real

## Estructura del Proyecto

```
whapsat-agente/
├── prisma/
│   └── schema.prisma          # Esquema de base de datos
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── api/              # API Routes
│   │   │   ├── auth/         # Autenticación
│   │   │   ├── appointments/ # Gestión de citas
│   │   │   └── bot/          # Estado del bot
│   │   ├── dashboard/        # Panel de administración
│   │   └── page.tsx          # Página de login
│   ├── bot/
│   │   └── whatsapp-bot.ts   # Bot de WhatsApp
│   ├── components/           # Componentes React
│   └── lib/                  # Utilidades
├── scripts/
│   └── init-db.ts            # Script de inicialización
└── package.json
```

## Tecnologías Utilizadas

- **Next.js 14** - Framework React
- **TypeScript** - Tipado estático
- **Prisma** - ORM para base de datos
- **whatsapp-web.js** - Cliente de WhatsApp
- **bcryptjs** - Encriptación de contraseñas
- **jsonwebtoken** - Autenticación JWT
- **date-fns** - Manejo de fechas

## Notas Importantes

1. **Seguridad**: Cambia el `JWT_SECRET` y las credenciales de admin en producción
2. **WhatsApp**: El bot requiere mantener la sesión activa. No cierres la terminal donde corre el bot
3. **Base de Datos**: Por defecto usa SQLite. Para producción, considera usar PostgreSQL o MySQL
4. **Horarios**: El bot valida que las citas sean entre 9:00 y 18:00 horas

## Desarrollo

### Ejecutar migraciones de Prisma
```bash
npx prisma migrate dev
```

### Ver la base de datos
```bash
npx prisma studio
```

### Compilar para producción
```bash
npm run build
npm start
```

## Solución de Problemas

### El bot no se conecta
- Asegúrate de haber escaneado el código QR
- Verifica que no haya otra sesión de WhatsApp Web activa
- Elimina la carpeta `.wwebjs_auth` y vuelve a intentar

### Error de autenticación
- Verifica que el archivo `.env` esté configurado correctamente
- Asegúrate de haber ejecutado `npx tsx scripts/init-db.ts`

## Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.
