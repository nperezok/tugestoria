# 🤖 Gestoría Bot — WhatsApp + IA + Google Calendar + CRM

Sistema completo para tu gestoría de multas:
- Chatbot de WhatsApp con IA (Claude) que asesora, pide DNI/patente y detecta el trámite.
- Agenda automática de turnos en Google Calendar (Lun-Vie 10-18hs, Sáb 10-14hs, turnos de 30min).
- CRM interno para seguir cada caso y derivarlo a un gestor.
- Recordatorios automáticos (24hs y 2hs antes del turno) y recupero de clientes que abandonaron la conversación.

---

## 1. Requisitos previos

1. **Cuenta de WhatsApp Business API (Meta Cloud API)**
   - Necesitás una cuenta en [Meta for Developers](https://developers.facebook.com/), crear una app tipo "Business", agregar el producto "WhatsApp".
   - Ahí obtenés: `WHATSAPP_TOKEN` (token permanente, se genera con un usuario de sistema), `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_BUSINESS_ACCOUNT_ID`.
   - Vas a configurar la URL del webhook apuntando a `https://tu-dominio.com/webhook` con el `WHATSAPP_VERIFY_TOKEN` que vos elijas.

2. **API Key de Anthropic (Claude)**
   - La conseguís en [console.anthropic.com](https://console.anthropic.com) → API Keys.

3. **Cuenta de servicio de Google (para Calendar)**
   - En [Google Cloud Console](https://console.cloud.google.com): crear un proyecto → habilitar "Google Calendar API" → crear una "Service Account" → generar una clave JSON.
   - Del JSON necesitás `client_email` (→ `GOOGLE_SERVICE_ACCOUNT_EMAIL`) y `private_key` (→ `GOOGLE_PRIVATE_KEY`).
   - **Importante:** tenés que compartir tu calendario de Google (el que vas a usar para los turnos) con el email de la cuenta de servicio, dándole permiso de "Realizar cambios en los eventos".
   - `GOOGLE_CALENDAR_ID` es el email del calendario (normalmente tu propio email de Gmail, o el ID de un calendario secundario creado para esto).

---

## 2. Instalación local (para probar antes de subirlo)

```bash
npm install
cp .env.example .env
# Editá .env y completá todas las claves
npm start
```

El servidor va a levantar en `http://localhost:3000`. El panel CRM está en `http://localhost:3000/panel`.

Para probar el webhook localmente antes de tener un dominio, podés usar [ngrok](https://ngrok.com):
```bash
ngrok http 3000
```
Y usar la URL que te da ngrok (ej: `https://xxxx.ngrok.io/webhook`) como webhook en Meta.

---

## 3. Despliegue recomendado (Railway)

Elegí Railway porque soporta volúmenes persistentes (necesarios para la base de datos SQLite) y es simple:

1. Subí este proyecto a un repositorio de GitHub.
2. Entrá a [railway.app](https://railway.app) → "New Project" → "Deploy from GitHub repo".
3. En "Variables", cargá todas las variables del `.env.example` con tus valores reales.
4. En "Settings" → agregá un **Volume** montado en `/app/data` (para que la base de datos no se borre en cada deploy).
5. Railway te da una URL pública (ej: `https://tu-app.up.railway.app`). Usala como webhook en Meta: `https://tu-app.up.railway.app/webhook`.

*(Alternativa: Render.com funciona igual, con "Persistent Disk" en vez de "Volume".)*

---

## 4. Configurar el webhook en Meta

1. En tu app de Meta for Developers → WhatsApp → Configuration.
2. Callback URL: `https://tu-dominio/webhook`
3. Verify Token: el mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`.
4. Suscribite al campo `messages`.

---

## 5. Cargar tus gestores

Antes de recibir clientes, cargá al menos un gestor desde el panel o con una llamada directa a la API:

```bash
curl -X POST https://tu-dominio/api/admin/gestores \
  -H "Content-Type: application/json" \
  -H "x-admin-password: TU_CLAVE_ADMIN" \
  -d '{"nombre": "Juan Pérez", "email": "juan@gestoria.com", "telefono": "5491122334455"}'
```

El sistema deriva automáticamente cada nuevo turno agendado al gestor con menos casos activos. También podés reasignar manualmente desde el panel.

---

## 6. Cómo funciona el flujo del bot

1. Cliente escribe → bot saluda y muestra botones con los tipos de trámite.
2. Pide DNI y patente (si no los tiene ya guardados).
3. Confirma el tipo de trámite exacto.
4. Pregunta si prefiere ir al local o recibir un llamado.
5. Ofrece los próximos 3 horarios libres (respetando Lun-Vie 10-18hs, Sáb 10-14hs, cada 30min, chequeando contra tu Google Calendar real).
6. Cliente elige un horario → se crea el evento en Google Calendar y el caso pasa a "turno_agendado".
7. Se deriva automáticamente a un gestor.
8. 24hs y 2hs antes del turno, el bot manda recordatorios automáticos.
9. Si un cliente deja la conversación a medias (por defecto, 6hs sin responder), el bot le manda un mensaje de recupero.

Todo el historial de mensajes y el estado de cada caso queda visible y editable en el panel CRM (`/panel`).

---

## 7. Personalización

- **Textos y tono del bot:** editá el `systemPrompt` en `src/services/claude.js`.
- **Horarios de atención:** variables `HOURS_*` en `.env`.
- **Duración de los turnos:** variable `SLOT_MINUTES` en `.env`.
- **Tiempos de recordatorio/recupero:** variables `RECOVERY_HOURS`, `REMINDER_HOURS_BEFORE*` en `.env`.
- **Nuevos tipos de trámite:** agregalos en `TRAMITES_VALIDOS` (`claude.js`) y en `NOMBRES_TRAMITE` (`stateMachine.js` y `reminders.js`).

---

## 8. Próximos pasos sugeridos (no incluidos en esta primera versión)

- Envío de **plantillas de WhatsApp** (necesarias si querés escribirle primero al cliente fuera de la ventana de 24hs, ej. para recuperos más agresivos) — requieren aprobación previa de Meta.
- Login con usuario/contraseña por gestor (hoy el panel usa una sola clave compartida).
- Métricas de conversión (cuántas conversaciones terminan en turno agendado, cuántas en venta cerrada).
- Migración a PostgreSQL si el volumen de casos crece mucho.
