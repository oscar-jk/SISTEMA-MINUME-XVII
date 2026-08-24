// Checklist: todas las tareas visibles (no solo las propias), agrupadas
// por fase del evento, con las mismas acciones y el mismo motor de
// estados que ya existen en Mis tareas / Bandeja — no es una lista
// aparte con su propio "hecho/no hecho": marcar algo aquí pasa por el
// mismo registro de avance, envío a revisión y aprobación de siempre.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { etiquetaPlazo, estaVencida } from '../utils/fechas.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import {
  ESTADO_TAREA_LABEL, nombreCompleto, escapeHtml, esPrioridadAlta,
} from '../utils/formato.js';
import { puedeRegistrarAvance, puedeEnviarRevision, puedeAprobarODevolver } from '../core/permisos.js';
import { abrirHojaAvance, enviarARevision } from './tareas.js';
import { aprobar, abrirHojaDevolucion } from './bandeja.js';

let contenedor = null;
let tareasCache = [];
let filtros = { fase: '', estado: '', texto: '' };

const FASE_SIN_FASE = { codigo: '', nombre: 'Sin fase / general', orden: 99 };

async function cargarFases() {
  const { data } = await supabase.from('fases_actividad').select('codigo, nombre, orden').order('orden');
  return data || [];
}

async function cargarTareas() {
  const { data, error } = await supabase
    .from('tareas')
    .select(`
      id, titulo, estado, prioridad, fecha_limite, progreso, responsable_cargo_id, supervisor_cargo_id, grupo_trabajo_id,
      actividad:actividades(id, nombre, codigo, fase:fases_actividad(codigo, nombre, orden)),
      responsable:cargos!tareas_responsable_cargo_id_fkey(nombre, persona:personas!cargos_persona_id_fkey(nombre, apellido))
    `)
    .order('fecha_limite', { ascending: true, nullsFirst: false });
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

function coincideTexto(t, texto) {
  if (!texto) return true;
  const q = texto.toLowerCase();
  return t.titulo.toLowerCase().includes(q)
    || (t.actividad?.nombre || '').toLowerCase().includes(q)
    || nombreCompleto(t.responsable?.persona).toLowerCase().includes(q);
}

function aplicarFiltros(lista) {
  return lista.filter((t) => (
    (!filtros.fase || (t.actividad?.fase?.codigo || '') === filtros.fase)
    && (!filtros.estado || t.estado === filtros.estado)
    && coincideTexto(t, filtros.texto)
  ));
}

function agruparPorFase(lista) {
  const grupos = new Map();
  for (const t of lista) {
    const fase = t.actividad?.fase || FASE_SIN_FASE;
    if (!grupos.has(fase.codigo)) grupos.set(fase.codigo, { fase, tareas: [] });
    grupos.get(fase.codigo).tareas.push(t);
  }
  return [...grupos.values()].sort((a, b) => a.fase.orden - b.fase.orden);
}

function contarCompletadas(lista) {
  return lista.filter((t) => t.estado === 'completada').length;
}

function filaTarea(tarea, alTerminar) {
  const { sesion } = getEstado();
  const vencida = estaVencida(tarea);
  const completada = tarea.estado === 'completada';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="checklist__marca">${completada ? icono('check-circulo', { tamano: 18, clase: 'checklist__check' }) : ''}</td>
    <td>
      ${esPrioridadAlta(tarea.prioridad) ? icono('estrella', { tamano: 12, clase: 'marcador-prioridad' }) : ''}<a href="/tarea.html?id=${tarea.id}">${escapeHtml(tarea.titulo)}</a>
      ${tarea.actividad ? `<div class="texto-mudo texto-pequeno">${escapeHtml(tarea.actividad.codigo)} · ${escapeHtml(tarea.actividad.nombre)}</div>` : ''}
    </td>
    <td>${tarea.responsable ? escapeHtml(nombreCompleto(tarea.responsable.persona)) : (tarea.grupo_trabajo_id ? '<span class="texto-mudo">Disponible</span>' : escapeHtml(nombreCompleto(tarea.responsable?.persona)))}</td>
    <td class="${vencida ? 'texto-danger' : ''}">${etiquetaPlazo(tarea)}</td>
    <td><span class="${`estado estado--${tarea.estado.replace(/_/g, '-')}`}">${ESTADO_TAREA_LABEL[tarea.estado]}</span></td>
    <td class="tabla__acciones" data-acciones></td>
  `;

  const acciones = tr.querySelector('[data-acciones]');
  if (puedeRegistrarAvance(sesion, tarea)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'boton boton--fantasma boton--pequeno';
    b.textContent = 'Avance';
    b.addEventListener('click', () => abrirHojaAvance(tarea, alTerminar));
    acciones.appendChild(b);
  }
  if (puedeEnviarRevision(sesion, tarea)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'boton boton--secundario boton--pequeno';
    b.textContent = 'Enviar a revisión';
    b.addEventListener('click', () => enviarARevision(tarea, alTerminar));
    acciones.appendChild(b);
  }
  if (tarea.estado === 'en_revision' && puedeAprobarODevolver(sesion, tarea)) {
    const aprobarBtn = document.createElement('button');
    aprobarBtn.type = 'button';
    aprobarBtn.className = 'boton boton--primario boton--pequeno';
    aprobarBtn.innerHTML = icono('check', { tamano: 14 });
    aprobarBtn.title = 'Aprobar';
    aprobarBtn.addEventListener('click', () => aprobar(tarea, alTerminar));
    const devolverBtn = document.createElement('button');
    devolverBtn.type = 'button';
    devolverBtn.className = 'boton boton--secundario boton--pequeno';
    devolverBtn.textContent = 'Devolver';
    devolverBtn.addEventListener('click', () => abrirHojaDevolucion(tarea, alTerminar));
    acciones.append(aprobarBtn, devolverBtn);
  }
  return tr;
}

function grupoFase(grupo, alTerminar) {
  const completadas = contarCompletadas(grupo.tareas);
  const seccion = document.createElement('section');
  seccion.className = 'checklist-grupo';
  seccion.innerHTML = `
    <div class="checklist-grupo__cabecera">
      <h2 class="subtitulo">${escapeHtml(grupo.fase.nombre)}</h2>
      <span class="texto-mudo texto-pequeno">${completadas}/${grupo.tareas.length} completadas</span>
    </div>
    <div class="tabla-envoltorio">
      <table class="tabla">
        <thead><tr><th></th><th>Tarea</th><th>Responsable</th><th>Plazo</th><th>Estado</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  `;
  const tbody = seccion.querySelector('tbody');
  for (const t of grupo.tareas) tbody.appendChild(filaTarea(t, alTerminar));
  return seccion;
}

async function pintar() {
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  const filtradas = aplicarFiltros(tareasCache);
  const totalCompletadas = contarCompletadas(filtradas);

  contenedor.querySelector('[data-resumen]').textContent = filtradas.length
    ? `${totalCompletadas}/${filtradas.length} tareas completadas`
    : '';

  if (filtradas.length === 0) {
    cuerpo.innerHTML = '<p class="estado-vacio">No hay tareas con estos filtros.</p>';
    return;
  }

  cuerpo.innerHTML = '';
  for (const grupo of agruparPorFase(filtradas)) {
    cuerpo.appendChild(grupoFase(grupo, recargar));
  }
}

async function recargar() {
  tareasCache = await cargarTareas();
  await pintar();
}

export async function render(el) {
  contenedor = el;
  const fases = await cargarFases();
  const opcionesEstado = Object.entries(ESTADO_TAREA_LABEL);

  el.innerHTML = `
    <div class="vista-cabecera">
      <h1>Checklist</h1>
      <span class="texto-mudo texto-pequeno" data-resumen></span>
    </div>
    <div class="checklist-filtros">
      <input type="search" placeholder="Buscar tarea, actividad o responsable…" data-buscar class="campo-buscar" />
      <div class="filtros-chip" data-fases>
        <button type="button" class="chip chip--activo" data-fase="">Todas las fases</button>
        ${fases.map((f) => `<button type="button" class="chip" data-fase="${f.codigo}">${escapeHtml(f.nombre)}</button>`).join('')}
      </div>
      <div class="filtros-chip" data-estados>
        <button type="button" class="chip chip--activo" data-estado="">Todos los estados</button>
        ${opcionesEstado.map(([clave, etiqueta]) => `<button type="button" class="chip" data-estado="${clave}">${escapeHtml(etiqueta)}</button>`).join('')}
      </div>
    </div>
    <div data-cuerpo>${esqueletoTabla()}</div>
  `;

  el.querySelector('[data-buscar]').addEventListener('input', (e) => {
    filtros.texto = e.target.value.trim();
    pintar();
  });
  el.querySelector('[data-fases]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fase]');
    if (!btn) return;
    filtros.fase = btn.dataset.fase;
    el.querySelectorAll('[data-fase]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
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
