import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Inicializando base de datos...')

  // Crear usuario admin por defecto
  const adminUsername = process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'

  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  const existingAdmin = await prisma.user.findUnique({
    where: { username: adminUsername }
  })

  if (existingAdmin) {
    console.log('Usuario admin ya existe')
  } else {
    await prisma.user.create({
      data: {
        username: adminUsername,
        password: hashedPassword,
        role: 'admin'
      }
    })
    console.log(`Usuario admin creado:
      Usuario: ${adminUsername}
      Contraseña: ${adminPassword}
      
      ⚠️ IMPORTANTE: Cambia la contraseña después del primer inicio de sesión!`)
  }

  console.log('Base de datos inicializada correctamente')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
