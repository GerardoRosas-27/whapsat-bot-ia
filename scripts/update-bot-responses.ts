import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Actualizando respuestas del bot...')

  // Desactivar la respuesta personalizada de "hola" para que el bot use su mensaje con números
  await prisma.botResponse.updateMany({
    where: {
      trigger: {
        contains: 'hola'
      }
    },
    data: {
      isActive: false
    }
  })

  console.log('✅ Respuestas actualizadas correctamente')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
