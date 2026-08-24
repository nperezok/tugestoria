const axios = require('axios');
const config = require('../config');

const BASE_URL = `https://graph.facebook.com/v20.0/${config.whatsapp.phoneNumberId}/messages`;

async function enviarTexto(telefono, texto) {
  try {
    await axios.post(
      BASE_URL,
      {
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'text',
        text: { body: texto },
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('Error enviando WhatsApp:', err.response?.data || err.message);
  }
}

// Botones interactivos (útil para elegir turno / tipo de trámite / confirmar)
async function enviarBotones(telefono, texto, botones) {
  // botones: [{ id: 'op1', title: 'Renovación' }, ...] máx 3
  try {
    await axios.post(
      BASE_URL,
      {
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: texto },
          action: {
            buttons: botones.slice(0, 3).map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.title.slice(0, 20) },
            })),
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('Error enviando botones WhatsApp:', err.response?.data || err.message);
  }
}

// Lista desplegable (útil para ofrecer varios horarios de turno)
async function enviarLista(telefono, texto, tituloBoton, opciones) {
  // opciones: [{ id, title, description }]
  try {
    await axios.post(
      BASE_URL,
      {
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: texto },
          action: {
            button: tituloBoton,
            sections: [{ title: 'Opciones disponibles', rows: opciones.slice(0, 10) }],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('Error enviando lista WhatsApp:', err.response?.data || err.message);
  }
}

// Extrae el texto plano de cualquier tipo de mensaje entrante (texto, botón o lista)
function extraerTextoEntrante(mensaje) {
  if (mensaje.type === 'text') return mensaje.text.body.trim();
  if (mensaje.type === 'interactive') {
    if (mensaje.interactive.type === 'button_reply') {
      return mensaje.interactive.button_reply.id; // devolvemos el ID para matchear en el flujo
    }
    if (mensaje.interactive.type === 'list_reply') {
      return mensaje.interactive.list_reply.id;
    }
  }
  return '';
}

module.exports = { enviarTexto, enviarBotones, enviarLista, extraerTextoEntrante };
