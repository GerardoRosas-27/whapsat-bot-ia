import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Creando usuario de prueba...')

  // Usuario de prueba
  const testUsername = 'testuser'
  const testPassword = 'test123'

  const hashedPassword = await bcrypt.hash(testPassword, 10)

  const existingUser = await prisma.user.findUnique({
    where: { username: testUsername }
  })

  if (existingUser) {
    console.log(`Usuario '${testUsername}' ya existe. Eliminando y recreando...`)
    await prisma.user.delete({
      where: { username: testUsername }
    })
  }

  await prisma.user.create({
    data: {
      username: testUsername,
      password: hashedPassword,
      role: 'admin'
    }
  })

  console.log(`
✅ Usuario de prueba creado exitosamente!

📋 Credenciales:
   Usuario: ${testUsername}
   Contraseña: ${testPassword}

🔐 Credenciales del admin (si existe):
   Usuario: admin
   Contraseña: admin123

🌐 Puedes iniciar sesión en: http://localhost:3000
  `)
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
