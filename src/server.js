const express = require('express');
const path = require('path');
const config = require('./config');
const webhookRoutes = require('./routes/webhook');
const adminRoutes = require('./routes/admin');
const { iniciarJobs } = require('./jobs/reminders');

const app = express();
app.use(express.json());

// Webhook de WhatsApp (Meta)
app.use('/', webhookRoutes);

// API del panel CRM
app.use('/api/admin', adminRoutes);

// Panel visual (archivos estáticos)
app.use('/panel', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('Servidor de gestoria-bot funcionando ✅ — Panel CRM en /panel');
});

app.listen(config.server.port, () => {
  console.log(`🚀 Servidor corriendo en puerto ${config.server.port}`);
  console.log(`📋 Panel CRM disponible en /panel`);
  iniciarJobs();
});
