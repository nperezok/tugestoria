-- Clientes que escriben por WhatsApp
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefono TEXT UNIQUE NOT NULL,       -- número de WhatsApp (wa_id)
  nombre TEXT,
  dni TEXT,
  patente TEXT,
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now'))
);

-- Gestores del local (para derivar casos)
CREATE TABLE IF NOT EXISTS gestores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now'))
);

-- Casos / trámites de cada cliente (esto ES el CRM)
CREATE TABLE IF NOT EXISTS casos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  tipo_tramite TEXT,                   -- renovacion_licencia | venta | compra | seguro | poner_al_dia | otro
  estado TEXT DEFAULT 'nuevo',         -- nuevo | en_conversacion | turno_agendado | en_gestion | resuelto | perdido
  gestor_id INTEGER REFERENCES gestores(id),
  modalidad_turno TEXT,                -- presencial | llamada
  turno_inicio TEXT,                   -- ISO datetime
  turno_fin TEXT,
  google_event_id TEXT,
  notas TEXT,
  origen TEXT DEFAULT 'whatsapp',
  ultima_interaccion TEXT DEFAULT (datetime('now')),
  recordatorio_24h_enviado INTEGER DEFAULT 0,
  recordatorio_2h_enviado INTEGER DEFAULT 0,
  recupero_enviado INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now'))
);

-- Historial de mensajes (para que el bot tenga contexto y para auditoría humana)
CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  caso_id INTEGER REFERENCES casos(id),
  direccion TEXT NOT NULL,             -- entrante | saliente
  texto TEXT,
  creado_en TEXT DEFAULT (datetime('now'))
);

-- Estado de la conversación del bot (máquina de estados por cliente)
CREATE TABLE IF NOT EXISTS estado_conversacion (
  cliente_id INTEGER PRIMARY KEY REFERENCES clientes(id),
  paso TEXT DEFAULT 'inicio',
  datos_temp TEXT DEFAULT '{}',        -- JSON con datos parciales recolectados
  actualizado_en TEXT DEFAULT (datetime('now'))
);
