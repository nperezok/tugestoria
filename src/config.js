require('dotenv').config();

module.exports = {
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  google: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    calendarId: process.env.GOOGLE_CALENDAR_ID,
  },
  business: {
    name: process.env.BUSINESS_NAME || 'Gestoría',
    timezone: process.env.TIMEZONE || 'America/Argentina/Buenos_Aires',
    slotMinutes: parseInt(process.env.SLOT_MINUTES || '30', 10),
    hours: {
      monFri: { start: process.env.HOURS_MON_FRI_START || '10:00', end: process.env.HOURS_MON_FRI_END || '18:00' },
      sat: { start: process.env.HOURS_SAT_START || '10:00', end: process.env.HOURS_SAT_END || '14:00' },
    },
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  },
  reminders: {
    recoveryHours: parseInt(process.env.RECOVERY_HOURS || '6', 10),
    reminderHoursBefore: parseInt(process.env.REMINDER_HOURS_BEFORE || '24', 10),
    reminderHoursBeforeShort: parseInt(process.env.REMINDER_HOURS_BEFORE_SHORT || '2', 10),
  },
};
