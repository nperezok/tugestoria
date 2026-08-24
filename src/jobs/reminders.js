const cron = require('node-cron');
const db = require('../db/database');
const whatsapp = require('../services/whatsapp');
const calendar = require('../services/calendar');
const config = require('../config');

const NOMBRES_TRAMITE = {
  renovacion_licencia: 'renovación de licencia',
  venta: 'venta del vehículo',
  compra: 'compra del vehículo',
  seguro: 'trámite del seguro',
  poner_al_dia: 'poner las multas al día',
  otro: 'tu consulta',
};

// Recordatorio 24hs antes del turno
async function enviarRecordatorios24h() {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() + (config.reminders.reminderHoursBefore - 0.25) * 3600000);
  const hasta = new Date(ahora.getTime() + (config.reminders.reminderHoursBefore + 0.25) * 3600000);

  const casos = db.casosParaRecordatorio24h(desde.toISOString(), hasta.toISOString());
  for (const caso of casos) {
    const fecha = calendar.formatearFechaLegible(new Date(caso.turno_inicio));
    const modalidad = caso.modalidad_turno === 'presencial' ? 'tu visita al local' : 'la llamada';
    await whatsapp.enviarTexto(
      caso.telefono,
      `Hola ${caso.nombre || ''} 👋 Te recordamos ${modalidad} de mañana ${fecha} para ${NOMBRES_TRAMITE[caso.tipo_tramite] || 'tu trámite'}.\n\nSi necesitás reprogramar, avisanos por acá.`
    );
    db.actualizarCaso(caso.id, { recordatorio_24h_enviado: 1 });
  }
}

// Recordatorio 2hs antes del turno
async function enviarRecordatorios2h() {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() + (config.reminders.reminderHoursBeforeShort - 0.25) * 3600000);
  const hasta = new Date(ahora.getTime() + (config.reminders.reminderHoursBeforeShort + 0.25) * 3600000);

  const casos = db.casosParaRecordatorio2h(desde.toISOString(), hasta.toISOString());
  for (const caso of casos) {
    const modalidad = caso.modalidad_turno === 'presencial' ? '¡Te esperamos en el local!' : 'te vamos a llamar en breve.';
    await whatsapp.enviarTexto(caso.telefono, `Hola ${caso.nombre || ''} 👋 En 2 horas es tu turno. ${modalidad}`);
    db.actualizarCaso(caso.id, { recordatorio_2h_enviado: 1 });
  }
}

// Recupero de clientes que dejaron la conversación a medias
async function enviarRecuperos() {
  const casos = db.casosAbandonados(config.reminders.recoveryHours);
  for (const caso of casos) {
    await whatsapp.enviarTexto(
      caso.telefono,
      `Hola ${caso.nombre || ''} 👋 Vimos que quedaste a mitad de tu consulta sobre ${NOMBRES_TRAMITE[caso.tipo_tramite] || 'tu trámite'}. ¿Seguimos? Te puedo conseguir un turno ahora mismo 🙌`
    );
    db.actualizarCaso(caso.id, { recupero_enviado: 1 });
  }
}

function iniciarJobs() {
  // Corre cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    try {
      await enviarRecordatorios24h();
      await enviarRecordatorios2h();
      await enviarRecuperos();
    } catch (err) {
      console.error('Error en jobs de recordatorios:', err);
    }
  });
  console.log('✅ Jobs de recordatorios y recupero iniciados (cada 15 min)');
}

module.exports = { iniciarJobs, enviarRecordatorios24h, enviarRecordatorios2h, enviarRecuperos };
