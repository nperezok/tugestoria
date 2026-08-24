const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'gestoria.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Inicializar esquema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---------- Clientes ----------
function getOrCreateCliente(telefono) {
  let cliente = db.prepare('SELECT * FROM clientes WHERE telefono = ?').get(telefono);
  if (!cliente) {
    const info = db.prepare('INSERT INTO clientes (telefono) VALUES (?)').run(telefono);
    cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
    db.prepare('INSERT INTO estado_conversacion (cliente_id) VALUES (?)').run(cliente.id);
  }
  return cliente;
}

function actualizarCliente(id, campos) {
  const keys = Object.keys(campos);
  if (keys.length === 0) return;
  const set = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => campos[k]);
  db.prepare(`UPDATE clientes SET ${set}, actualizado_en = datetime('now') WHERE id = ?`).run(...values, id);
}

// ---------- Estado de conversación ----------
function getEstado(clienteId) {
  const row = db.prepare('SELECT * FROM estado_conversacion WHERE cliente_id = ?').get(clienteId);
  if (!row) return { paso: 'inicio', datos_temp: {} };
  return { ...row, datos_temp: JSON.parse(row.datos_temp || '{}') };
}

function setEstado(clienteId, paso, datosTemp) {
  db.prepare(
    `INSERT INTO estado_conversacion (cliente_id, paso, datos_temp, actualizado_en)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(cliente_id) DO UPDATE SET paso = excluded.paso, datos_temp = excluded.datos_temp, actualizado_en = datetime('now')`
  ).run(clienteId, paso, JSON.stringify(datosTemp || {}));
}

// ---------- Casos ----------
function crearCaso(clienteId, tipoTramite) {
  const info = db
    .prepare('INSERT INTO casos (cliente_id, tipo_tramite, estado) VALUES (?, ?, ?)')
    .run(clienteId, tipoTramite, 'en_conversacion');
  return db.prepare('SELECT * FROM casos WHERE id = ?').get(info.lastInsertRowid);
}

function getCasoAbierto(clienteId) {
  return db
    .prepare(
      `SELECT * FROM casos WHERE cliente_id = ? AND estado NOT IN ('resuelto', 'perdido')
       ORDER BY id DESC LIMIT 1`
    )
    .get(clienteId);
}

function actualizarCaso(id, campos) {
  const keys = Object.keys(campos);
  if (keys.length === 0) return;
  const set = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => campos[k]);
  db.prepare(`UPDATE casos SET ${set}, actualizado_en = datetime('now') WHERE id = ?`).run(...values, id);
}

function listarCasos({ estado, gestorId } = {}) {
  let query = `
    SELECT casos.*, clientes.nombre as cliente_nombre, clientes.telefono, clientes.dni, clientes.patente,
           gestores.nombre as gestor_nombre
    FROM casos
    JOIN clientes ON clientes.id = casos.cliente_id
    LEFT JOIN gestores ON gestores.id = casos.gestor_id
    WHERE 1=1
  `;
  const params = [];
  if (estado) {
    query += ' AND casos.estado = ?';
    params.push(estado);
  }
  if (gestorId) {
    query += ' AND casos.gestor_id = ?';
    params.push(gestorId);
  }
  query += ' ORDER BY casos.actualizado_en DESC';
  return db.prepare(query).all(...params);
}

function casosParaRecordatorio24h(desde, hasta) {
  return db
    .prepare(
      `SELECT casos.*, clientes.telefono, clientes.nombre FROM casos
       JOIN clientes ON clientes.id = casos.cliente_id
       WHERE casos.estado = 'turno_agendado' AND casos.recordatorio_24h_enviado = 0
       AND casos.turno_inicio BETWEEN ? AND ?`
    )
    .all(desde, hasta);
}

function casosParaRecordatorio2h(desde, hasta) {
  return db
    .prepare(
      `SELECT casos.*, clientes.telefono, clientes.nombre FROM casos
       JOIN clientes ON clientes.id = casos.cliente_id
       WHERE casos.estado = 'turno_agendado' AND casos.recordatorio_2h_enviado = 0
       AND casos.turno_inicio BETWEEN ? AND ?`
    )
    .all(desde, hasta);
}

function casosAbandonados(horasSinInteraccion) {
  return db
    .prepare(
      `SELECT casos.*, clientes.telefono, clientes.nombre FROM casos
       JOIN clientes ON clientes.id = casos.cliente_id
       WHERE casos.estado IN ('nuevo', 'en_conversacion')
       AND casos.recupero_enviado = 0
       AND datetime(casos.ultima_interaccion) <= datetime('now', ?)`
    )
    .all(`-${horasSinInteraccion} hours`);
}

// ---------- Mensajes ----------
function guardarMensaje(clienteId, casoId, direccion, texto) {
  db.prepare('INSERT INTO mensajes (cliente_id, caso_id, direccion, texto) VALUES (?, ?, ?, ?)').run(
    clienteId,
    casoId || null,
    direccion,
    texto
  );
}

function historialMensajes(clienteId, limite = 20) {
  return db
    .prepare('SELECT * FROM mensajes WHERE cliente_id = ? ORDER BY id DESC LIMIT ?')
    .all(clienteId, limite)
    .reverse();
}

// ---------- Gestores ----------
function listarGestores() {
  return db.prepare('SELECT * FROM gestores WHERE activo = 1').all();
}

function crearGestor(nombre, email, telefono) {
  const info = db.prepare('INSERT INTO gestores (nombre, email, telefono) VALUES (?, ?, ?)').run(nombre, email, telefono);
  return db.prepare('SELECT * FROM gestores WHERE id = ?').get(info.lastInsertRowid);
}

function gestorConMenosCasos() {
  return db
    .prepare(
      `SELECT gestores.* FROM gestores
       LEFT JOIN casos ON casos.gestor_id = gestores.id AND casos.estado NOT IN ('resuelto', 'perdido')
       WHERE gestores.activo = 1
       GROUP BY gestores.id
       ORDER BY COUNT(casos.id) ASC
       LIMIT 1`
    )
    .get();
}

module.exports = {
  db,
  getOrCreateCliente,
  actualizarCliente,
  getEstado,
  setEstado,
  crearCaso,
  getCasoAbierto,
  actualizarCaso,
  listarCasos,
  casosParaRecordatorio24h,
  casosParaRecordatorio2h,
  casosAbandonados,
  guardarMensaje,
  historialMensajes,
  listarGestores,
  crearGestor,
  gestorConMenosCasos,
};
