let PASSWORD = '';
let CASOS = [];
let FILTRO_ACTUAL = '';
let CASO_SELECCIONADO = null;

function ingresar() {
  PASSWORD = document.getElementById('password').value;
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  cargarTodo();
  setInterval(cargarTodo, 20000); // refresco automático cada 20s
}

async function apiGet(ruta) {
  const res = await fetch(`/api/admin${ruta}`, { headers: { 'x-admin-password': PASSWORD } });
  if (res.status === 401) {
    alert('Clave incorrecta');
    location.reload();
  }
  return res.json();
}

async function apiPost(ruta, body) {
  const res = await fetch(`/api/admin${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': PASSWORD },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

async function apiPatch(ruta, body) {
  const res = await fetch(`/api/admin${ruta}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': PASSWORD },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

async function cargarTodo() {
  await cargarMetricas();
  await cargarCasos();
  await cargarGestoresSelect();
}

async function cargarMetricas() {
  const datos = await apiGet('/metricas');
  const cont = document.getElementById('metricas');
  cont.innerHTML = datos.map((d) => `<span>${d.estado}: ${d.cantidad}</span>`).join('');
}

async function cargarCasos() {
  const query = FILTRO_ACTUAL ? `?estado=${FILTRO_ACTUAL}` : '';
  CASOS = await apiGet(`/casos${query}`);
  renderTabla();
}

function renderTabla() {
  const tbody = document.getElementById('cuerpo-tabla');
  tbody.innerHTML = CASOS.map(
    (c) => `
    <tr onclick="abrirModal(${c.id})">
      <td>${c.cliente_nombre || '-'}</td>
      <td>${c.telefono}</td>
      <td>${c.dni || '-'}</td>
      <td>${c.patente || '-'}</td>
      <td>${c.tipo_tramite || '-'}</td>
      <td><span class="badge ${c.estado}">${c.estado}</span></td>
      <td>${c.turno_inicio ? new Date(c.turno_inicio).toLocaleString('es-AR') : '-'}</td>
      <td>${c.gestor_nombre || '-'}</td>
      <td>Ver</td>
    </tr>`
  ).join('');
}

function filtrar(estado) {
  FILTRO_ACTUAL = estado;
  document.querySelectorAll('.filtros button').forEach((b) => b.classList.remove('activo'));
  event.target.classList.add('activo');
  cargarCasos();
}

async function cargarGestoresSelect() {
  const gestores = await apiGet('/gestores');
  const select = document.getElementById('modal-gestor');
  select.innerHTML =
    '<option value="">Sin asignar</option>' +
    gestores.map((g) => `<option value="${g.id}">${g.nombre}</option>`).join('');
}

async function abrirModal(casoId) {
  CASO_SELECCIONADO = CASOS.find((c) => c.id === casoId);
  document.getElementById('modal').style.display = 'flex';
  document.getElementById('modal-titulo').textContent = `${CASO_SELECCIONADO.cliente_nombre || CASO_SELECCIONADO.telefono} — ${CASO_SELECCIONADO.tipo_tramite || ''}`;
  document.getElementById('modal-estado').value = CASO_SELECCIONADO.estado;
  document.getElementById('modal-gestor').value = CASO_SELECCIONADO.gestor_id || '';

  const mensajes = await apiGet(`/clientes/${CASO_SELECCIONADO.cliente_id}/mensajes`);
  const cont = document.getElementById('modal-mensajes');
  cont.innerHTML = mensajes.map((m) => `<div class="${m.direccion}">${m.texto}</div>`).join('');
  cont.scrollTop = cont.scrollHeight;
}

function cerrarModal() {
  document.getElementById('modal').style.display = 'none';
  CASO_SELECCIONADO = null;
}

async function enviarManual() {
  const texto = document.getElementById('modal-texto').value.trim();
  if (!texto || !CASO_SELECCIONADO) return;
  await apiPost(`/clientes/${CASO_SELECCIONADO.telefono}/mensaje`, { texto });
  document.getElementById('modal-texto').value = '';
  abrirModal(CASO_SELECCIONADO.id);
}

async function guardarCambiosCaso() {
  if (!CASO_SELECCIONADO) return;
  const estado = document.getElementById('modal-estado').value;
  const gestorId = document.getElementById('modal-gestor').value || null;
  await apiPatch(`/casos/${CASO_SELECCIONADO.id}`, { estado, gestor_id: gestorId });
  cerrarModal();
  cargarTodo();
}
