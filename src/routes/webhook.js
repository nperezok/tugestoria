const express = require('express');
const config = require('../config');
const { manejarMensajeEntrante } = require('../conversation/stateMachine');

const router = express.Router();

// Verificación inicial del webhook (Meta la pide una sola vez al configurar)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Recepción de mensajes entrantes
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // respondemos rápido a Meta, procesamos después

  console.log('[DEBUG] === Webhook llamado ===');
  console.log('[DEBUG] Body completo:', JSON.stringify(req.body));

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const mensaje = value?.messages?.[0];

    if (!mensaje) {
      console.log('[DEBUG] No hay "messages" en este webhook (probablemente es un status de entregado/leído). Se ignora.');
      return;
    }

    console.log('[DEBUG] Mensaje crudo de WhatsApp:', JSON.stringify(mensaje));

    const telefono = mensaje.from;
    const nombrePerfil = value.contacts?.[0]?.profile?.name;

    const whatsapp = require('../services/whatsapp');
    const texto = whatsapp.extraerTextoEntrante(mensaje);
    if (!texto) return;

    await manejarMensajeEntrante(telefono, texto, nombrePerfil);
  } catch (err) {
    console.error('Error procesando webhook:', err);
  }
});

module.exports = router;