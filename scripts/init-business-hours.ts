import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Inicializando horarios de atención...')

  // Verificar si ya existe configuración
  const existing = await prisma.businessHours.findFirst({
    where: { isActive: true }
  })

  if (existing) {
    console.log('Ya existe configuración de horarios. Actualizando...')
    // Desactivar la existente
    await prisma.businessHours.update({
      where: { id: existing.id },
      data: { isActive: false }
    })
  }

  // Crear nueva configuración con valores por defecto
  await prisma.businessHours.create({
    data: {
      startTime: '08:00',
      endTime: '18:00',
      appointmentDuration: 60,
      isActive: true,
      restPeriods: {
        create: [
          {
            startTime: '12:00',
            endTime: '13:00',
            description: 'Hora de comida',
            isActive: true
          }
        ]
      },
      nonWorkingDays: {
        create: []
      }
    }
  })

  console.log('✅ Horarios inicializados correctamente')
  console.log('   - Horario de atención: 08:00 - 18:00')
  console.log('   - Periodo de descanso: 12:00 - 13:00 (Hora de comida)')
  console.log('   - Duración de citas: 60 minutos')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
