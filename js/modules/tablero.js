// Tablero consolidado: alcance automático por RLS (0024_tablero.sql) — un
// voluntario agrega solo lo suyo, un jefe de rama su rama, SG todo. Los
// agregados los calcula Postgres; aquí solo se suman los totales que ya
// vienen agrupados por rama, nunca se descarga una tabla completa.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { crearTabla } from '../ui/tabla.js';
import { puedeAsignar } from '../core/permisos.js';

let contenedor = null;

async function fetchTodo() {
  const claves = ['avance', 'vencidas', 'revision', 'asistencia', 'evidencia', 'actividades', 'vacantes'];
  const [avance, vencidas, revision, asistencia, evidencia, actividades, vacantes] = await Promise.all([
    supabase.from('v_tablero_avance_rama').select('*'),
    supabase.from('v_tablero_tareas_vencidas').select('*'),
    supabase.from('v_tablero_revision_pendiente').select('*'),
    supabase.from('v_tablero_asistencia_hoy').select('*'),
    supabase.from('v_tablero_evidencia_pendiente').select('*'),
    supabase.from('v_tablero_actividades_semana').select('*').order('fecha'),
    supabase.from('v_tablero_cargos_vacantes').select('*'),
  ]);
  const resultados = { avance, vencidas, revision, asistencia, evidencia, actividades, vacantes };
  const datos = {};
  for (const clave of claves) {
    const { data, error } = resultados[clave];
    if (error) { mostrarAviso(mensajeError(error), 'error'); datos[clave] = []; }
    else datos[clave] = data || [];
  }
  return datos;
}

function tarjeta({ titulo, valor, subtitulo, href, iconoNombre }) {
  const cuerpo = `
    ${icono(iconoNombre, { tamano: 22, clase: 'tablero-tarjeta__icono' })}
    <p class="tablero-tarjeta__valor">${valor}</p>
    <p class="tablero-tarjeta__titulo">${titulo}</p>
    ${subtitulo ? `<p class="tablero-tarjeta__subtitulo texto-mudo">${subtitulo}</p>` : ''}
  `;
  return href
    ? `<a class="tablero-tarjeta" href="${href}">${cuerpo}</a>`
    : `<div class="tablero-tarjeta tablero-tarjeta--estatica">${cuerpo}</div>`;
}

function sumar(filas, clave) {
  return filas.reduce((total, fila) => total + Number(fila[clave] || 0), 0);
}

export async function render(el) {
  contenedor = el;
  const { sesion } = getEstado();
  const puede = puedeAsignar(sesion);

  el.innerHTML = '<div class="vista-cabecera"><h1>Tablero</h1></div><p class="estado-vacio">Cargando…</p>';
  const datos = await fetchTodo();
  if (contenedor !== el) return;

  const totalVencidas = sumar(datos.vencidas, 'vencidas');
  const totalRevision = datos.revision.length;
  const totalEvidencia = sumar(datos.evidencia, 'pendientes');
  const totalVacantes = sumar(datos.vacantes, 'vacantes');
  const dotacion = sumar(datos.asistencia, 'dotacion');
  const marcados = sumar(datos.asistencia, 'marcados');
  const tardanzas = sumar(datos.asistencia, 'tardanzas');
  const ausentes = Math.max(0, dotacion - marcados);

  const tarjetas = [
    tarjeta({
      titulo: 'Tareas vencidas', valor: totalVencidas, iconoNombre: 'alerta',
      href: puede ? '/bandeja.html' : '/mis-tareas.html?filtro=vencidas',
    }),
    tarjeta({
      titulo: 'En revisión', valor: totalRevision, subtitulo: 'Esperando aprobación', iconoNombre: 'check-circulo',
      href: puede ? '/bandeja.html' : '/mis-tareas.html?filtro=en_revision',
    }),
    tarjeta({
      titulo: 'Evidencia pendiente', valor: totalEvidencia, iconoNombre: 'adjunto',
      href: puede ? '/bandeja.html' : null,
    }),
    tarjeta({
      titulo: 'Asistencia de hoy', valor: `${marcados}/${dotacion}`,
      subtitulo: `${ausentes} ausentes · ${tardanzas} tardanza${tardanzas === 1 ? '' : 's'}`,
      iconoNombre: 'reloj', href: '/asistencia.html',
    }),
    tarjeta({
      titulo: 'Actividades próximos 7 días', valor: datos.actividades.length, iconoNombre: 'calendario',
      href: '/calendario.html',
    }),
    tarjeta({
      titulo: 'Cargos vacantes', valor: totalVacantes, iconoNombre: 'admin',
      href: puede ? '/admin-personas.html' : null,
    }),
  ];

  el.innerHTML = `
    <div class="vista-cabecera"><h1>Tablero</h1></div>
    <div class="tablero-grid">${tarjetas.join('')}</div>
    <div class="tablero-seccion">
      <h2 class="subtitulo">Avance por rama</h2>
      <div data-avance></div>
    </div>
    <div class="tablero-seccion">
      <h2 class="subtitulo">Actividades de hoy y próximos 7 días</h2>
      <div data-actividades></div>
    </div>
  `;

  el.querySelector('[data-avance]').replaceChildren(crearTabla([
    { clave: 'division', titulo: 'División', render: (f) => (f.division || '—').toUpperCase() },
    { clave: 'subsecretaria', titulo: 'Subsecretaría' },
    { clave: 'completadas', titulo: 'Completadas' },
    { clave: 'total', titulo: 'Total' },
    { clave: 'porcentaje_avance', titulo: '% avance', render: (f) => (f.porcentaje_avance === null ? '—' : `${f.porcentaje_avance}%`) },
  ], datos.avance));

  el.querySelector('[data-actividades]').replaceChildren(crearTabla([
    { clave: 'fecha', titulo: 'Fecha' },
    { clave: 'codigo', titulo: 'Código' },
    { clave: 'nombre', titulo: 'Actividad' },
    {
      clave: 'dotacion',
      titulo: 'Dotación cubierta/requerida',
      render: (f) => `${f.dotacion_cubierta}/${f.dotacion_requerida}`,
    },
  ], datos.actividades));
}

export function destroy() {
  contenedor = null;
}
