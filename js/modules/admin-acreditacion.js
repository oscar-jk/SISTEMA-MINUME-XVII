// Revisión de acreditaciones: aprobar/rechazar es puede_asignar(), igual
// que el resto del sistema. Los datos de salud viven aparte
// (acreditados_salud) y el botón para verlos solo aparece si el propio
// cargo tiene acceso_salud_acreditacion — la RLS es la puerta real, esto
// es solo para no mostrar un botón que va a fallar.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { pintarSubnavAdmin } from '../core/shell.js';
import { icono } from '../ui/icono.js';
import { abrirModal } from '../ui/modal.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { crearTabla } from '../ui/tabla.js';
import { ROL_ACREDITACION_LABEL, ESTADO_ACREDITADO_LABEL, escapeHtml } from '../utils/formato.js';
import { puedeAsignar } from '../core/permisos.js';

let contenedor = null;
let acreditados = [];
let filtros = { estado: '', rol: '', texto: '' };

async function cargar() {
  const { data, error } = await supabase
    .from('acreditados')
    .select('id, codigo_qr, rol, nombre, apellido, telefono, correo, regional:regionales(codigo), estado, motivo_rechazo, creado_en, foto_path, certificado_medico_path')
    .order('creado_en', { ascending: false });
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

function coincideTexto(a, texto) {
  if (!texto) return true;
  const q = texto.toLowerCase();
  return `${a.nombre} ${a.apellido}`.toLowerCase().includes(q)
    || (a.correo || '').toLowerCase().includes(q)
    || a.codigo_qr.toLowerCase().includes(q);
}

function aplicarFiltros(lista) {
  return lista.filter((a) => (
    (!filtros.estado || a.estado === filtros.estado)
    && (!filtros.rol || a.rol === filtros.rol)
    && coincideTexto(a, filtros.texto)
  ));
}

async function verSalud(acreditado) {
  const { data, error } = await supabase
    .from('acreditados_salud')
    .select('diagnostico, alergias, tratamiento, contacto_emergencia, telefono_emergencia')
    .eq('acreditado_id', acreditado.id)
    .maybeSingle();

  if (error || !data) {
    mostrarAviso('No tienes acceso a los datos de salud de esta acreditación.', 'error');
    return;
  }

  let certificadoUrl = null;
  if (acreditado.certificado_medico_path) {
    const { data: firmada } = await supabase.storage.from('acreditacion').createSignedUrl(acreditado.certificado_medico_path, 300);
    certificadoUrl = firmada?.signedUrl ?? null;
  }

  const div = document.createElement('div');
  div.innerHTML = `
    <div class="ficha-datos">
      <div><span class="texto-mudo texto-pequeno">Diagnóstico</span><strong>${escapeHtml(data.diagnostico || '—')}</strong></div>
      <div><span class="texto-mudo texto-pequeno">Alergias</span><strong>${escapeHtml(data.alergias || '—')}</strong></div>
      <div><span class="texto-mudo texto-pequeno">Tratamiento</span><strong>${escapeHtml(data.tratamiento || '—')}</strong></div>
      <div><span class="texto-mudo texto-pequeno">Contacto de emergencia</span><strong>${escapeHtml(data.contacto_emergencia || '—')}</strong></div>
      <div><span class="texto-mudo texto-pequeno">Teléfono de emergencia</span><strong>${escapeHtml(data.telefono_emergencia || '—')}</strong></div>
    </div>
    ${certificadoUrl ? `<p style="margin-top:1rem"><a href="${escapeHtml(certificadoUrl)}" target="_blank" rel="noopener">${icono('adjunto', { tamano: 14 })} Ver certificado médico (PDF)</a></p>` : ''}
  `;
  abrirModal({ titulo: `Salud — ${acreditado.nombre} ${acreditado.apellido}`, contenido: div, ancho: 'angosto' });
}

async function aprobar(acreditado, alTerminar) {
  const { error } = await supabase.from('acreditados').update({ estado: 'aprobado' }).eq('id', acreditado.id);
  if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
  mostrarAviso('Acreditación aprobada.', 'exito');
  alTerminar();
}

function abrirModalRechazo(acreditado, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <form class="formulario" data-form-rechazo>
      <label class="campo"><span>Motivo del rechazo</span><textarea name="motivo" rows="3" required></textarea></label>
      <button type="submit" class="boton boton--primario boton--ancho">Rechazar</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: `Rechazar: ${acreditado.nombre} ${acreditado.apellido}`, contenido: div, ancho: 'angosto' });
  div.querySelector('[data-form-rechazo]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const motivo = e.target.querySelector('[name="motivo"]').value.trim();
    if (!motivo) { mostrarAviso('Escribe un motivo para rechazar.', 'error'); return; }
    const { error } = await supabase.from('acreditados').update({ estado: 'rechazado', motivo_rechazo: motivo }).eq('id', acreditado.id);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Acreditación rechazada.', 'exito');
    cerrar();
    alTerminar();
  });
}

function pintarResumen(el, lista) {
  const total = lista.length;
  const pendientes = lista.filter((a) => a.estado === 'pendiente').length;
  const aprobados = lista.filter((a) => a.estado === 'aprobado').length;
  const rechazados = lista.filter((a) => a.estado === 'rechazado').length;
  el.textContent = `${total} registros · ${pendientes} pendientes · ${aprobados} aprobados · ${rechazados} rechazados`;
}

async function pintar() {
  const { sesion } = getEstado();
  const puedeVerSalud = sesion.esSuperAdmin || sesion.cargo.acceso_salud_acreditacion;
  const filtradas = aplicarFiltros(acreditados);

  pintarResumen(contenedor.querySelector('[data-resumen]'), acreditados);

  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  if (filtradas.length === 0) {
    cuerpo.innerHTML = '<p class="estado-vacio">No hay registros con estos filtros.</p>';
    return;
  }

  const tabla = crearTabla([
    { clave: 'nombre', titulo: 'Nombre', render: (a) => `${a.nombre} ${a.apellido}` },
    { clave: 'rol', titulo: 'Rol', render: (a) => ROL_ACREDITACION_LABEL[a.rol] || a.rol },
    { clave: 'regional', titulo: 'Regional', render: (a) => a.regional?.codigo ?? 'N/A' },
    { clave: 'contacto', titulo: 'Contacto', render: (a) => a.telefono || a.correo || '—' },
    { clave: 'estado', titulo: 'Estado', html: true, render: (a) => `<span class="estado estado--${a.estado === 'aprobado' ? 'completada' : a.estado === 'rechazado' ? 'cancelada' : 'no-iniciada'}">${escapeHtml(ESTADO_ACREDITADO_LABEL[a.estado])}</span>` },
    { clave: 'codigo_qr', titulo: 'Código' },
    { clave: 'acciones', titulo: '' },
  ], filtradas);

  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const acreditado = filtradas[i];
    if (!acreditado) return;
    const td = tr.querySelector('td:last-child');
    td.className = 'tabla__acciones';

    if (acreditado.estado === 'pendiente') {
      const aprobarBtn = document.createElement('button');
      aprobarBtn.type = 'button';
      aprobarBtn.className = 'boton boton--primario boton--pequeno';
      aprobarBtn.innerHTML = icono('check', { tamano: 14 });
      aprobarBtn.title = 'Aprobar';
      aprobarBtn.addEventListener('click', () => aprobar(acreditado, recargar));
      td.appendChild(aprobarBtn);

      const rechazarBtn = document.createElement('button');
      rechazarBtn.type = 'button';
      rechazarBtn.className = 'boton boton--secundario boton--pequeno';
      rechazarBtn.textContent = 'Rechazar';
      rechazarBtn.addEventListener('click', () => abrirModalRechazo(acreditado, recargar));
      td.appendChild(rechazarBtn);
    }

    if (puedeVerSalud) {
      const saludBtn = document.createElement('button');
      saludBtn.type = 'button';
      saludBtn.className = 'boton boton--fantasma boton--pequeno';
      saludBtn.textContent = 'Salud';
      saludBtn.addEventListener('click', () => verSalud(acreditado));
      td.appendChild(saludBtn);
    }
  });

  cuerpo.innerHTML = '';
  cuerpo.appendChild(tabla);
}

async function recargar() {
  acreditados = await cargar();
  await pintar();
}

export async function render(el) {
  contenedor = el;
  const { sesion } = getEstado();
  if (!puedeAsignar(sesion)) {
    el.innerHTML = '<p class="estado-vacio">No tienes permiso para ver esta página.</p>';
    return;
  }

  el.innerHTML = `
    <div class="vista-cabecera">
      <h1>Acreditación</h1>
      <span class="texto-mudo texto-pequeno" data-resumen></span>
    </div>
    <div data-subnav-admin></div>
    <div class="checklist-filtros">
      <input type="search" placeholder="Buscar por nombre, correo o código…" data-buscar class="campo-buscar" />
      <div class="filtros-chip" data-estados>
        <button type="button" class="chip chip--activo" data-estado="">Todos</button>
        <button type="button" class="chip" data-estado="pendiente">Pendientes</button>
        <button type="button" class="chip" data-estado="aprobado">Aprobados</button>
        <button type="button" class="chip" data-estado="rechazado">Rechazados</button>
      </div>
    </div>
    <div data-cuerpo><p class="estado-vacio">Cargando…</p></div>
  `;

  pintarSubnavAdmin(el.querySelector('[data-subnav-admin]'), sesion);

  el.querySelector('[data-buscar]').addEventListener('input', (e) => {
    filtros.texto = e.target.value.trim();
    pintar();
  });
  el.querySelector('[data-estados]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-estado]');
    if (!btn) return;
    filtros.estado = btn.dataset.estado;
    el.querySelectorAll('[data-estado]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
    pintar();
  });

  await recargar();
}

export function destroy() {
  contenedor = null;
}
