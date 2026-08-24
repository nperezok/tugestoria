const { google } = require('googleapis');
const config = require('../config');

function getAuth() {
  return new google.auth.JWT(
    config.google.serviceAccountEmail,
    null,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/calendar']
  );
}

function getCalendarClient() {
  return google.calendar({ version: 'v3', auth: getAuth() });
}

// Devuelve { start: 'HH:mm', end: 'HH:mm' } según el día de la semana, o null si no atiende ese día
function horarioDelDia(date) {
  const dia = date.getDay(); // 0 = domingo, 6 = sábado
  if (dia === 0) return null; // domingo cerrado
  if (dia === 6) return config.business.hours.sat;
  return config.business.hours.monFri; // lunes a viernes
}

function combinarFechaHora(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// Genera todos los slots posibles de un día (sin filtrar ocupados todavía)
function generarSlotsDelDia(date) {
  const horario = horarioDelDia(date);
  if (!horario) return [];
  const slots = [];
  let actual = combinarFechaHora(date, horario.start);
  const fin = combinarFechaHora(date, horario.end);
  const duracionMs = config.business.slotMinutes * 60 * 1000;

  while (actual.getTime() + duracionMs <= fin.getTime()) {
    slots.push(new Date(actual));
    actual = new Date(actual.getTime() + duracionMs);
  }
  return slots;
}

// Busca los próximos N slots libres a partir de hoy, revisando el calendario real
async function buscarProximosSlotsLibres(cantidad = 3, diasHaciaAdelante = 14) {
  const calendar = getCalendarClient();
  const ahora = new Date();
  const desde = new Date(ahora);
  const hasta = new Date(ahora);
  hasta.setDate(hasta.getDate() + diasHaciaAdelante);

  const eventos = await calendar.events.list({
    calendarId: config.google.calendarId,
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const ocupados = (eventos.data.items || []).map((ev) => ({
    start: new Date(ev.start.dateTime || ev.start.date).getTime(),
    end: new Date(ev.end.dateTime || ev.end.date).getTime(),
  }));

  const duracionMs = config.business.slotMinutes * 60 * 1000;
  const disponibles = [];

  for (let i = 0; i < diasHaciaAdelante && disponibles.length < cantidad; i++) {
    const dia = new Date(ahora);
    dia.setDate(dia.getDate() + i);
    const slotsDelDia = generarSlotsDelDia(dia);

    for (const slot of slotsDelDia) {
      if (slot.getTime() < ahora.getTime() + 60 * 60 * 1000) continue; // al menos 1hs de anticipación
      const slotFin = slot.getTime() + duracionMs;
      const solapa = ocupados.some((o) => slot.getTime() < o.end && slotFin > o.start);
      if (!solapa) {
        disponibles.push(new Date(slot));
        if (disponibles.length >= cantidad) break;
      }
    }
  }

  return disponibles;
}

async function crearEvento({ inicio, resumen, descripcion, telefono, modalidad }) {
  const calendar = getCalendarClient();
  const fin = new Date(inicio.getTime() + config.business.slotMinutes * 60 * 1000);

  const evento = await calendar.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary: resumen,
      description: `${descripcion}\nTeléfono: ${telefono}\nModalidad: ${modalidad}`,
      start: { dateTime: inicio.toISOString(), timeZone: config.business.timezone },
      end: { dateTime: fin.toISOString(), timeZone: config.business.timezone },
    },
  });

  return evento.data;
}

async function cancelarEvento(eventId) {
  const calendar = getCalendarClient();
  try {
    await calendar.events.delete({ calendarId: config.google.calendarId, eventId });
  } catch (err) {
    console.error('Error cancelando evento:', err.message);
  }
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatearFechaCorta(date) {
  const dia = DIAS_CORTOS[date.getDay()];
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const opts = { hour: '2-digit', minute: '2-digit', timeZone: config.business.timezone, hour12: false };
  const hora = date.toLocaleTimeString('es-AR', opts);
  return `${dia} ${dd}/${mm} ${hora}`;
}

function formatearFechaLegible(date) {
  return date.toLocaleString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: config.business.timezone,
  });
}

module.exports = {
  buscarProximosSlotsLibres,
  crearEvento,
  cancelarEvento,
  formatearFechaLegible,
  formatearFechaCorta,
};