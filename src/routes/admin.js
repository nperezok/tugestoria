const express = require('express');
const db = require('../db/database');
const config = require('../config');
const whatsapp = require('../services/whatsapp');
const calendar = require('../services/calendar');

const router = express.Router();

// Middleware simple de autenticación por clave (para un panel interno chico)
router.use((req, res, next) => {
  const clave = req.headers['x-admin-password'] || req.query.password;
  if (clave !== config.server.adminPassword) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
});

// Listar casos (con filtros opcionales por estado o gestor)
router.get('/casos', (req, res) => {
  const { estado, gestorId } = req.query;
  const casos = db.listarCasos({ estado, gestorId });
  res.json(casos);
});

// Ver historial de mensajes de un cliente
router.get('/clientes/:id/mensajes', (req, res) => {
  const mensajes = db.historialMensajes(req.params.id, 100);
  res.json(mensajes);
});

// Actualizar un caso (cambiar estado, notas, derivar a otro gestor)
router.patch('/casos/:id', (req, res) => {
  const { estado, notas, gestor_id } = req.body;
  const campos = {};
  if (estado) campos.estado = estado;
  if (notas !== undefined) campos.notas = notas;
  if (gestor_id !== undefined) campos.gestor_id = gestor_id;
  db.actualizarCaso(req.params.id, campos);
  res.json({ ok: true });
});

// Cancelar un turno (y liberar el hueco en Google Calendar)
router.post('/casos/:id/cancelar-turno', async (req, res) => {
  const caso = db.db.prepare('SELECT * FROM casos WHERE id = ?').get(req.params.id);
  if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

  if (caso.google_event_id) {
    await calendar.cancelarEvento(caso.google_event_id);
  }
  db.actualizarCaso(caso.id, { estado: 'en_gestion', turno_inicio: null, turno_fin: null, google_event_id: null });
  res.json({ ok: true });
});

// Gestores
router.get('/gestores', (req, res) => {
  res.json(db.listarGestores());
});

router.post('/gestores', (req, res) => {
  const { nombre, email, telefono } = req.body;
  const gestor = db.crearGestor(nombre, email, telefono);
  res.json(gestor);
});

// Enviar mensaje manual a un cliente desde el panel (para que un gestor tome el control)
router.post('/clientes/:telefono/mensaje', async (req, res) => {
  const { texto } = req.body;
  await whatsapp.enviarTexto(req.params.telefono, texto);
  const cliente = db.getOrCreateCliente(req.params.telefono);
  const caso = db.getCasoAbierto(cliente.id);
  db.guardarMensaje(cliente.id, caso?.id, 'saliente', texto);
  res.json({ ok: true });
});

// Métricas rápidas para el dashboard
router.get('/metricas', (req, res) => {
  const totales = db.db
    .prepare(`SELECT estado, COUNT(*) as cantidad FROM casos GROUP BY estado`)
    .all();
  res.json(totales);
});

module.exports = router;
