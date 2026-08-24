const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const TRAMITES_VALIDOS = ['renovacion_licencia', 'venta', 'compra', 'seguro', 'poner_al_dia', 'otro'];

/**
 * Le pide a Claude que:
 * 1) Interprete el mensaje del cliente dentro del contexto del paso actual
 * 2) Extraiga datos (dni, patente, tipo de trámite, elección de horario, etc.)
 * 3) Redacte una respuesta breve y cordial para WhatsApp
 * Devuelve SIEMPRE un JSON estructurado.
 */
async function interpretarMensaje({ paso, datosTemp, historial, mensajeUsuario, opcionesContexto }) {
  const systemPrompt = `Sos el asistente virtual de "${config.business.name}", una gestoría especializada en resolución de multas de tránsito.
Tu trabajo es guiar al cliente por WhatsApp de forma cordial, breve y clara (mensajes cortos, sin párrafos largos), y extraer datos estructurados.

Trámites posibles: renovacion_licencia, venta, compra, seguro (trámite para el seguro), poner_al_dia (poner las multas al día), otro.

Reglas:
- Nunca inventes información legal específica sobre multas; si preguntan detalles legales complejos, indicá que un gestor lo va a asesorar en el turno.
- Sé cálido pero eficiente, como una recepcionista experta.
- Si el cliente ya dio un dato (DNI, patente) en mensajes anteriores, no lo vuelvas a pedir.
- El DNI es un número de 7 u 8 dígitos. La patente puede ser formato viejo (AAA000) o mercosur (AA000AA).
- Siempre respondé ÚNICAMENTE con un JSON válido, sin texto adicional, con esta forma exacta:
{
  "intencion": "dar_tramite | dar_dni | dar_patente | dar_nombre | elegir_turno | confirmar | cancelar | pregunta_general | otro",
  "tipo_tramite": "uno de los valores válidos o null",
  "dni": "string o null",
  "patente": "string o null",
  "nombre": "string o null",
  "respuesta": "el mensaje que le vamos a mandar al cliente por WhatsApp"
}

Contexto del paso actual del flujo: ${paso}
Datos ya recolectados: ${JSON.stringify(datosTemp)}
${opcionesContexto ? `Opciones válidas en este paso: ${opcionesContexto}` : ''}`;

  const messages = [
    ...historial.map((m) => ({
      role: m.direccion === 'entrante' ? 'user' : 'assistant',
      content: m.texto,
    })),
    { role: 'user', content: mensajeUsuario },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: systemPrompt,
    messages,
  });

  const textoResp = response.content.find((c) => c.type === 'text')?.text || '{}';
  const limpio = textoResp.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(limpio);
    if (parsed.tipo_tramite && !TRAMITES_VALIDOS.includes(parsed.tipo_tramite)) {
      parsed.tipo_tramite = null;
    }
    return parsed;
  } catch (err) {
    console.error('Error parseando respuesta de Claude:', limpio);
    return {
      intencion: 'otro',
      tipo_tramite: null,
      dni: null,
      patente: null,
      nombre: null,
      respuesta: 'Perdón, ¿podés repetir eso? No llegué a entenderlo bien 🙏',
    };
  }
}

module.exports = { interpretarMensaje, TRAMITES_VALIDOS };
