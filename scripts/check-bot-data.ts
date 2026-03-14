import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const patterns = await prisma.appointmentPattern.findMany()
    console.log('\n📋 Patrones de solicitud:', patterns.length)
    patterns.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.pattern} - ${p.description} (Prioridad: ${p.priority}, Activo: ${p.isActive})`)
    })

    const dates = await prisma.dateFormat.findMany()
    console.log('\n📅 Formatos de fecha:', dates.length)
    dates.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.format} - Ejemplo: ${d.example || 'N/A'} (Prioridad: ${d.priority}, Activo: ${d.isActive})`)
    })

    const times = await prisma.timeFormat.findMany()
    console.log('\n🕐 Formatos de hora:', times.length)
    times.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.format} - Ejemplo: ${t.example || 'N/A'} (Prioridad: ${t.priority}, Activo: ${t.isActive})`)
    })

    const responses = await prisma.botResponse.findMany()
    console.log('\n💬 Respuestas del bot:', responses.length)
    responses.forEach((r, i) => {
      console.log(`  ${i + 1}. Trigger: ${r.trigger.substring(0, 30)}... (Tipo: ${r.responseType}, Prioridad: ${r.priority}, Activo: ${r.isActive})`)
    })

    console.log('\n✅ Verificación completada')
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
