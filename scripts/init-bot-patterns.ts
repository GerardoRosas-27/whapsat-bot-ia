import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Inicializando patrones y formatos del bot...')

  // Limpiar datos existentes
  await prisma.appointmentPattern.deleteMany()
  await prisma.dateFormat.deleteMany()
  await prisma.timeFormat.deleteMany()
  await prisma.botResponse.deleteMany()

  // Patrones de solicitud de citas
  const appointmentPatterns = [
    // Agendar cita
    { pattern: 'agendar|solicitar|reservar|pedir.*cita|quiero.*cita|necesito.*cita', description: 'Solicitud de agendar cita', priority: 10, isActive: true },
    { pattern: 'cita nueva|nueva cita|agendar consulta|solicitar consulta', description: 'Solicitud explícita de nueva cita', priority: 9, isActive: true },
    { pattern: 'quiero.*ver|necesito.*ver|me gustaría.*ver|puedo.*ver', description: 'Expresiones de deseo de cita', priority: 8, isActive: true },
    
    // Cancelar cita
    { pattern: 'cancelar.*cita|cancelar.*consulta|anular.*cita|eliminar.*cita', description: 'Solicitud de cancelar cita', priority: 10, isActive: true },
    { pattern: 'no.*quiero.*cita|no.*puedo.*ir|no.*asistir', description: 'Expresiones de cancelación', priority: 8, isActive: true },
    
    // Reagendar cita
    { pattern: 'reagendar|reprogramar|cambiar.*fecha|cambiar.*hora|mover.*cita', description: 'Solicitud de reagendar cita', priority: 10, isActive: true },
    { pattern: 'cambiar.*cita|modificar.*cita|otra.*fecha|otra.*hora', description: 'Expresiones de cambio de cita', priority: 9, isActive: true },
    
    // Confirmar cita
    { pattern: 'confirmar.*cita|confirmo|sí.*asisto|si.*asisto|confirmación', description: 'Confirmación de asistencia a cita', priority: 10, isActive: true },
    { pattern: 'estoy.*seguro|voy.*ir|asistiré|asistire', description: 'Expresiones de confirmación', priority: 8, isActive: true },
    
    // Ver citas
    { pattern: 'mis.*citas|mis.*consultas|ver.*citas|listar.*citas|citas.*programadas', description: 'Consulta de citas programadas', priority: 9, isActive: true },
    
    // Palabras clave generales
    { pattern: 'cita|consulta|sesión|sesion|terapia', description: 'Palabras clave de cita', priority: 7, isActive: true },
    { pattern: 'disponible|libre|horario|disponibilidad', description: 'Consultas de disponibilidad', priority: 6, isActive: true },
  ]

  for (const pattern of appointmentPatterns) {
    await prisma.appointmentPattern.create({
      data: pattern
    })
  }

  // Formatos de fecha
  const dateFormats = [
    { format: 'dd/MM/yyyy', pattern: '(\\d{1,2})/(\\d{1,2})/(\\d{4})', example: '15/01/2024', priority: 10 },
    { format: 'dd-MM-yyyy', pattern: '(\\d{1,2})-(\\d{1,2})-(\\d{4})', example: '15-01-2024', priority: 9 },
    { format: 'yyyy-MM-dd', pattern: '(\\d{4})-(\\d{1,2})-(\\d{1,2})', example: '2024-01-15', priority: 8 },
    { format: 'dd/MM/yy', pattern: '(\\d{1,2})/(\\d{1,2})/(\\d{2})', example: '15/01/24', priority: 7 },
    { format: 'dd.MM.yyyy', pattern: '(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})', example: '15.01.2024', priority: 6 },
    { format: 'd MMMM yyyy', pattern: '(\\d{1,2})\\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\\s+(\\d{4})', example: '15 enero 2024', priority: 5 },
    { format: 'd de MMMM de yyyy', pattern: '(\\d{1,2})\\s+de\\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\\s+de\\s+(\\d{4})', example: '15 de enero de 2024', priority: 4 },
  ]

  for (const dateFormat of dateFormats) {
    await prisma.dateFormat.create({
      data: dateFormat
    })
  }

  // Formatos de hora
  const timeFormats = [
    { format: 'HH:mm', pattern: '(\\d{1,2}):(\\d{2})', example: '10:00', priority: 10 },
    { format: 'H:mm', pattern: '(\\d{1,2}):(\\d{2})', example: '9:30', priority: 9 },
    { format: 'HHmm', pattern: '(\\d{2})(\\d{2})', example: '1000', priority: 8 },
    { format: 'h:mm a', pattern: '(\\d{1,2}):(\\d{2})\\s*(am|pm|AM|PM)', example: '10:00 am', priority: 7 },
    { format: 'h a', pattern: '(\\d{1,2})\\s*(am|pm|AM|PM)', example: '10 am', priority: 6 },
    { format: 'H horas', pattern: '(\\d{1,2})\\s*horas?', example: '10 horas', priority: 5 },
    { format: 'H:00', pattern: '(\\d{1,2}):00', example: '10:00', priority: 4 },
  ]

  for (const timeFormat of timeFormats) {
    await prisma.timeFormat.create({
      data: timeFormat
    })
  }

  // Respuestas del bot
  const botResponses = [
    // Saludos (desactivado - el bot maneja esto directamente con números)
    // { trigger: 'hola|hi|buenos días|buenas tardes|buenas noches|buen día', response: '👋 ¡Hola! Soy tu asistente para agendar citas de psicología.\n\n¿En qué puedo ayudarte?\n📅 Agendar cita\n📋 Ver mis citas\n❌ Cancelar cita\n🔄 Reagendar cita\n\nEscribe *ayuda* para más opciones.', responseType: 'text', priority: 10, isActive: false },
    
    // Ayuda
    { trigger: 'ayuda|help|comandos|opciones|qué puedo hacer', response: '📚 *Comandos disponibles:*\n\n• *agendar* - Nueva cita\n• *mis citas* - Ver citas\n• *cancelar* - Cancelar cita\n• *reagendar* - Cambiar fecha/hora\n• *confirmar* - Confirmar asistencia\n\n*Ejemplos:*\n• "Quiero agendar cita el 15/01/2024 a las 10:00"\n• "Cancelar mi cita"\n• "Reagendar para mañana a las 2pm"', responseType: 'help', priority: 10, isActive: true },
    
    // Solicitud de información para agendar
    { trigger: 'solicitando.*nombre|necesito.*nombre|dame.*nombre', response: '👤 Por favor, proporciona tu nombre completo para agendar la cita.', responseType: 'text', priority: 8, isActive: true },
    { trigger: 'solicitando.*fecha|necesito.*fecha|dame.*fecha', response: '📅 ¿Qué fecha prefieres? Puedes usar:\n• 15/01/2024\n• 15-01-2024\n• Mañana\n• Lunes', responseType: 'text', priority: 8, isActive: true },
    { trigger: 'solicitando.*hora|necesito.*hora|dame.*hora', response: '🕐 ¿A qué hora? Puedes usar:\n• 10:00\n• 10:00 am\n• 2:00 pm\n• 10 horas', responseType: 'text', priority: 8, isActive: true },
    
    // Confirmación de agendamiento
    { trigger: 'cita.*agendada|agendada.*exitosamente|cita.*creada', response: '✅ *Cita agendada exitosamente*\n\nTe notificaremos cuando sea confirmada. Recibirás un recordatorio un día antes.', responseType: 'success', priority: 10, isActive: true },
    { trigger: 'cita.*confirmada|confirmada.*exitosamente', response: '✅ Tu cita ha sido confirmada. Te esperamos en la fecha y hora acordada.', responseType: 'success', priority: 9, isActive: true },
    
    // Cancelación
    { trigger: 'cita.*cancelada|cancelada.*exitosamente|anulada.*exitosamente', response: '✅ Tu cita ha sido cancelada. Si necesitas reagendar, solo avísame.', responseType: 'success', priority: 10, isActive: true },
    { trigger: 'confirmando.*cancelación|seguro.*cancelar', response: '⚠️ ¿Estás seguro de cancelar tu cita? Responde *sí* para confirmar o *no* para mantenerla.', responseType: 'text', priority: 8, isActive: true },
    
    // Reagendamiento
    { trigger: 'cita.*reagendada|reagendada.*exitosamente|fecha.*cambiada', response: '✅ Tu cita ha sido reagendada exitosamente. La nueva fecha y hora han sido actualizadas.', responseType: 'success', priority: 10, isActive: true },
    
    // Confirmación de asistencia
    { trigger: 'asistencia.*confirmada|confirmo.*asistencia|asistiré', response: '✅ Perfecto, tu asistencia ha sido confirmada. Te esperamos.', responseType: 'success', priority: 9, isActive: true },
    
    // Errores
    { trigger: 'error.*fecha|fecha.*inválida|no.*entendí.*fecha', response: '❌ No entendí la fecha. Usa:\n• 15/01/2024\n• 15-01-2024\n• Mañana\n• Lunes', responseType: 'error', priority: 8, isActive: true },
    { trigger: 'error.*hora|hora.*inválida|no.*entendí.*hora', response: '❌ No entendí la hora. Usa:\n• 10:00\n• 10:00 am\n• 2:00 pm', responseType: 'error', priority: 8, isActive:  true },
    { trigger: 'error.*nombre|nombre.*requerido|falta.*nombre', response: '❌ Necesito tu nombre completo para agendar la cita.', responseType: 'error', priority: 7, isActive: true },
    { trigger: 'error.*general|no.*entendí|no.*comprendo', response: '❌ No entendí tu mensaje. Escribe *ayuda* para ver las opciones disponibles.', responseType: 'error', priority: 6, isActive: true },
    { trigger: 'cita.*no.*encontrada|no.*tiene.*citas', response: 'ℹ️ No tienes citas programadas. ¿Quieres agendar una?', responseType: 'text', priority: 7, isActive: true },
    { trigger: 'fecha.*ocupada|horario.*ocupado|no.*disponible', response: '⚠️ Lo siento, ese horario no está disponible. ¿Puedes elegir otra fecha u hora?', responseType: 'error', priority: 7, isActive: true },
    
    // Despedidas
    { trigger: 'gracias|thank you|muchas gracias', response: '😊 De nada. ¡Que tengas un buen día!', responseType: 'text', priority: 6, isActive: true },
    { trigger: 'adiós|chao|hasta luego|nos vemos', response: '👋 ¡Hasta luego! Cualquier cosa, aquí estaré.', responseType: 'text', priority: 5, isActive: true },
  ]

  for (const response of botResponses) {
    await prisma.botResponse.create({
      data: response
    })
  }

  console.log('✅ Patrones y formatos inicializados correctamente')
  console.log(`   - ${appointmentPatterns.length} patrones de solicitud`)
  console.log(`   - ${dateFormats.length} formatos de fecha`)
  console.log(`   - ${timeFormats.length} formatos de hora`)
  console.log(`   - ${botResponses.length} respuestas del bot`)
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
