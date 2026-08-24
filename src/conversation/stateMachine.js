const db = require('../db/database');
const whatsapp = require('../services/whatsapp');
const claude = require('../services/claude');
const calendar = require('../services/calendar');

const NOMBRES_TRAMITE = {
  renovacion_licencia: 'Renovación de licencia',
  venta: 'Venta del vehículo',
  compra: 'Compra del vehículo',
  seguro: 'Trámite para el seguro',
  poner_al_dia: 'Poner las multas al día',
  otro: 'Consulta general',
};

const PALABRAS_REINICIO = ['reiniciar', 'menu', 'menú', 'empezar de nuevo', 'volver al inicio'];

async function manejarMensajeEntrante(telefono, textoEntrante, nombrePerfilWA) {
  const cliente = db.getOrCreateCliente(telefono);

  // Palabra clave de reinicio: útil si el cliente queda trabado en algún paso
  // (por ejemplo, si vuelve a tocar un botón de WhatsApp que ya usó antes)
  if (PALABRAS_REINICIO.includes(textoEntrante.trim().toLowerCase())) {
    db.setEstado(cliente.id, 'inicio', {});
  }
  if (nombrePerfilWA && !cliente.nombre) {
    db.actualizarCliente(cliente.id, { nombre: nombrePerfilWA });
  }

  let caso = db.getCasoAbierto(cliente.id);
  const estado = db.getEstado(cliente.id);
  const historial = db.historialMensajes(cliente.id, 12);

  db.guardarMensaje(cliente.id, caso?.id, 'entrante', textoEntrante);

  // ---- Paso: INICIO -> ofrecer menú de trámites ----
  if (estado.paso === 'inicio') {
    await whatsapp.enviarBotones(
      telefono,
      `¡Hola! 👋 Soy el asistente virtual de la gestoría. Te ayudo a resolver tus multas.\n\n¿Qué necesitás hacer?`,
      [
        { id: 'tramite_licencia_venta_compra', title: 'Licencia/Venta/Compra' },
        { id: 'tramite_seguro_dia', title: 'Seguro / Poner al día' },
        { id: 'tramite_otro', title: 'Otra consulta' },
      ]
    );
    db.setEstado(cliente.id, 'esperando_tipo_tramite', {});
    db.guardarMensaje(cliente.id, null, 'saliente', '[Menú de trámites enviado]');
    return;
  }

  // Sub-menú si eligió un grupo genérico por botones
  if (estado.paso === 'esperando_tipo_tramite' && textoEntrante === 'tramite_licencia_venta_compra') {
    await whatsapp.enviarBotones(telefono, 'Perfecto, ¿cuál de estos es tu caso?', [
      { id: 'renovacion_licencia', title: 'Renovar licencia' },
      { id: 'venta', title: 'Venta del auto' },
      { id: 'compra', title: 'Compra del auto' },
    ]);
    return;
  }
  if (estado.paso === 'esperando_tipo_tramite' && textoEntrante === 'tramite_seguro_dia') {
    await whatsapp.enviarBotones(telefono, 'Dale, contame cuál necesitás:', [
      { id: 'seguro', title: 'Trámite seguro' },
      { id: 'poner_al_dia', title: 'Poner al día' },
    ]);
    return;
  }

  // Cualquier otro caso: usamos Claude para interpretar texto libre o IDs de botones
  const interpretacion = await claude.interpretarMensaje({
    paso: estado.paso,
    datosTemp: estado.datos_temp,
    historial,
    mensajeUsuario: textoEntrante,
    opcionesContexto: null,
  });

  const datos = { ...estado.datos_temp };
  if (interpretacion.tipo_tramite) datos.tipo_tramite = interpretacion.tipo_tramite;
  if (interpretacion.dni) datos.dni = interpretacion.dni;
  if (interpretacion.patente) datos.patente = interpretacion.patente;
  if (interpretacion.nombre) datos.nombre = interpretacion.nombre;

  // Si ya tenemos tipo de trámite y no hay caso abierto, lo creamos
  if (datos.tipo_tramite && !caso) {
    caso = db.crearCaso(cliente.id, datos.tipo_tramite);
  } else if (datos.tipo_tramite && caso && !caso.tipo_tramite) {
    db.actualizarCaso(caso.id, { tipo_tramite: datos.tipo_tramite });
  }

  if (datos.dni) db.actualizarCliente(cliente.id, { dni: datos.dni });
  if (datos.patente) db.actualizarCliente(cliente.id, { patente: datos.patente.toUpperCase() });
  if (datos.nombre) db.actualizarCliente(cliente.id, { nombre: datos.nombre });

  const clienteActualizado = db.getOrCreateCliente(telefono);

  // ---- Decidir siguiente paso según qué datos faltan ----
  if (!clienteActualizado.dni) {
    await enviarYGuardar(telefono, cliente.id, caso?.id, '¿Me pasás tu DNI, por favor?');
    db.setEstado(cliente.id, 'esperando_dni', datos);
    return;
  }

  if (!clienteActualizado.patente) {
    await enviarYGuardar(telefono, cliente.id, caso?.id, '¿Y la patente del vehículo?');
    db.setEstado(cliente.id, 'esperando_patente', datos);
    return;
  }

  if (!caso || !caso.tipo_tramite) {
    await enviarYGuardar(
      telefono,
      cliente.id,
      caso?.id,
      'Contame, ¿cuál de estos trámites necesitás: renovación de licencia, venta, compra, seguro o poner las multas al día?'
    );
    db.setEstado(cliente.id, 'esperando_tipo_tramite', datos);
    return;
  }

  // Ya tenemos DNI, patente y tipo de trámite -> ofrecer modalidad y turno
  if (estado.paso !== 'esperando_modalidad' && estado.paso !== 'esperando_turno') {
    await whatsapp.enviarBotones(
      telefono,
      `Genial ${clienteActualizado.nombre || ''}, ya tengo tus datos ✅\nTrámite: ${NOMBRES_TRAMITE[caso.tipo_tramite] || caso.tipo_tramite}\n\n¿Preferís venir al local o que te llamemos por teléfono?`,
      [
        { id: 'modalidad_presencial', title: 'Ir al local' },
        { id: 'modalidad_llamada', title: 'Llamada telefónica' },
      ]
    );
    db.setEstado(cliente.id, 'esperando_modalidad', datos);
    return;
  }

  if (estado.paso === 'esperando_modalidad') {
    let modalidad = null;
    if (textoEntrante === 'modalidad_presencial') modalidad = 'presencial';
    if (textoEntrante === 'modalidad_llamada') modalidad = 'llamada';

    if (!modalidad) {
      await enviarYGuardar(telefono, cliente.id, caso.id, 'Elegí una opción: ¿venís al local o preferís que te llamemos?');
      return;
    }

    db.actualizarCaso(caso.id, { modalidad_turno: modalidad });
    await ofrecerTurnos(telefono, cliente, caso);
    datos.modalidad_turno = modalidad;
    db.setEstado(cliente.id, 'esperando_turno', datos);
    return;
  }

  if (estado.paso === 'esperando_turno') {
    await confirmarTurnoElegido(telefono, cliente, caso, textoEntrante, estado.datos_temp);
    return;
  }

  // Fallback: usar la respuesta natural que generó Claude
  await enviarYGuardar(telefono, cliente.id, caso?.id, interpretacion.respuesta);
}

async function enviarYGuardar(telefono, clienteId, casoId, texto) {
  await whatsapp.enviarTexto(telefono, texto);
  db.guardarMensaje(clienteId, casoId, 'saliente', texto);
}

async function ofrecerTurnos(telefono, cliente, caso) {
  const slots = await calendar.buscarProximosSlotsLibres(3);
  if (slots.length === 0) {
    await enviarYGuardar(
      telefono,
      cliente.id,
      caso.id,
      'Por ahora no encuentro turnos disponibles. Un gestor te va a contactar para coordinar un horario 🙏'
    );
    db.actualizarCaso(caso.id, { estado: 'en_gestion' });
    return;
  }

  const opciones = slots.map((slot, i) => ({
    id: `turno_${slot.toISOString()}`,
    title: calendar.formatearFechaLegible(slot).slice(0, 24),
  }));

  await whatsapp.enviarLista(telefono, 'Estos son los próximos horarios disponibles:', 'Ver horarios', opciones);
  db.guardarMensaje(cliente.id, caso.id, 'saliente', '[Opciones de turno enviadas]');
}

async function confirmarTurnoElegido(telefono, cliente, caso, textoEntrante, datosTemp) {
  if (!textoEntrante.startsWith('turno_')) {
    await enviarYGuardar(telefono, cliente.id, caso.id, 'Elegí uno de los horarios de la lista, por favor 🙏');
    return;
  }

  const isoFecha = textoEntrante.replace('turno_', '');
  const inicio = new Date(isoFecha);

  const evento = await calendar.crearEvento({
    inicio,
    resumen: `${NOMBRES_TRAMITE[caso.tipo_tramite] || caso.tipo_tramite} - ${cliente.nombre || cliente.telefono}`,
    descripcion: `DNI: ${cliente.dni}\nPatente: ${cliente.patente}\nTrámite: ${caso.tipo_tramite}`,
    telefono: cliente.telefono,
    modalidad: datosTemp.modalidad_turno,
  });

  db.actualizarCaso(caso.id, {
    estado: 'turno_agendado',
    turno_inicio: inicio.toISOString(),
    turno_fin: new Date(inicio.getTime() + 30 * 60000).toISOString(),
    google_event_id: evento.id,
  });

  // Derivar automáticamente al gestor con menos casos activos
  const gestor = db.gestorConMenosCasos();
  if (gestor) {
    db.actualizarCaso(caso.id, { gestor_id: gestor.id });
  }

  const modalidadTexto = datosTemp.modalidad_turno === 'presencial' ? 'tu visita al local' : 'la llamada telefónica';
  await enviarYGuardar(
    telefono,
    cliente.id,
    caso.id,
    `¡Turno confirmado! ✅\n${modalidadTexto} es el ${calendar.formatearFechaLegible(inicio)}.\n\nTe voy a mandar un recordatorio antes. ¡Gracias! 🙌`
  );

  db.setEstado(cliente.id, 'turno_confirmado', {});
}

module.exports = { manejarMensajeEntrante };
