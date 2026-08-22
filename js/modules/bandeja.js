import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { abrirModal } from '../ui/modal.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { etiquetaPlazo, estaVencida } from '../utils/fechas.js';
import { ESTADO_TAREA_LABEL, nombreCompleto, escapeHtml } from '../utils/formato.js';

let contenedor = null;
let tareas = [];

async function cargar() {
  const { data, error } = await supabase
    .from('tareas')
    .select(`
      id, titulo, estado, fecha_limite, progreso,
      actividad:actividades(codigo, nombre),
      responsable:cargos!tareas_responsable_cargo_id_fkey(nombre, persona:personas(nombre, apellido))
    `)
    .order('fecha_limite', { ascending: true, nullsFirst: false });
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return [];
  }
  return data.filter((t) => t.estado === 'en_revision' || estaVencida(t));
}

function orden(t) {
  if (t.estado === 'en_revision') return 0;
  if (estaVencida(t)) return 1;
  return 2;
}

export function abrirHojaDevolucion(tarea, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <label class="campo">
      <span>Motivo de la devolución</span>
      <textarea rows="4" placeholder="Explica qué falta para aprobarla" required></textarea>
    </label>
    <button type="button" class="boton boton--primario boton--ancho" data-confirmar>Devolver a en curso</button>
  `;
  const { cerrar } = abrirModal({ titulo: `Devolver: ${tarea.titulo}`, contenido: div, ancho: 'angosto' });

  div.querySelector('[data-confirmar]').addEventListener('click', async () => {
    const motivo = div.querySelector('textarea').value.trim();
    if (!motivo) {
      mostrarAviso('Escribe un motivo para devolver la tarea.', 'error');
      return;
    }
    const { error } = await supabase
      .from('tareas')
      .update({ estado: 'en_curso', motivo_devolucion: motivo })
      .eq('id', tarea.id);
    if (error) {
      mostrarAviso(mensajeError(error), 'error');
      return;
    }
    mostrarAviso('Tarea devuelta.', 'exito');
    cerrar();
    alTerminar();
  });
}

export async function aprobar(tarea, alTerminar) {
  const { error } = await supabase.from('tareas').update({ estado: 'completada' }).eq('id', tarea.id);
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return;
  }
  mostrarAviso('Tarea aprobada.', 'exito');
  await (alTerminar || recargar)();
}

function fila(tarea) {
  const vencida = estaVencida(tarea);
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><a href="/tarea.html?id=${tarea.id}">${escapeHtml(tarea.titulo)}</a>${tarea.actividad ? `<div class="texto-mudo texto-pequeno">${escapeHtml(tarea.actividad.codigo)}</div>` : ''}</td>
    <td><span class="${'estado estado--' + tarea.estado.replace(/_/g, '-')}">${ESTADO_TAREA_LABEL[tarea.estado]}</span></td>
    <td>${escapeHtml(nombreCompleto(tarea.responsable?.persona))}</td>
    <td class="${vencida ? 'texto-danger' : ''}">${etiquetaPlazo(tarea)}</td>
    <td class="tabla__acciones" data-acciones></td>
  `;
  const acciones = tr.querySelector('[data-acciones]');
  if (tarea.estado === 'en_revision') {
    const aprobarBtn = document.createElement('button');
    aprobarBtn.className = 'boton boton--primario boton--pequeno';
    aprobarBtn.innerHTML = icono('check', { tamano: 14 });
    aprobarBtn.title = 'Aprobar';
    aprobarBtn.addEventListener('click', () => aprobar(tarea));

    const devolverBtn = document.createElement('button');
    devolverBtn.className = 'boton boton--secundario boton--pequeno';
    devolverBtn.textContent = 'Devolver';
    devolverBtn.addEventListener('click', () => abrirHojaDevolucion(tarea, recargar));

    acciones.append(aprobarBtn, devolverBtn);
  } else {
    const verBtn = document.createElement('button');
    verBtn.className = 'boton boton--fantasma boton--pequeno';
    verBtn.textContent = 'Ver';
    verBtn.addEventListener('click', () => { location.href = `/tarea.html?id=${tarea.id}`; });
    acciones.appendChild(verBtn);
  }
  return tr;
}

function pintar() {
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  if (tareas.length === 0) {
    cuerpo.innerHTML = '<p class="estado-vacio">Bandeja al día: no hay tareas en revisión ni vencidas.</p>';
    return;
  }
  const ordenadas = [...tareas].sort((a, b) => orden(a) - orden(b));
  cuerpo.innerHTML = '';
  const tabla = document.createElement('table');
  tabla.className = 'tabla';
  tabla.innerHTML = '<thead><tr><th>Tarea</th><th>Estado</th><th>Responsable</th><th>Plazo</th><th></th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const t of ordenadas) tbody.appendChild(fila(t));
  tabla.appendChild(tbody);
  cuerpo.appendChild(tabla);
}

async function recargar() {
  tareas = await cargar();
  pintar();
}

export async function render(el) {
  contenedor = el;
  const { sesion } = getEstado();
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Bandeja de ${sesion.cargo.nombre}</h1></div>
    <div data-cuerpo><p class="estado-vacio">Cargando…</p></div>
  `;
  await recargar();
}

export function destroy() {
  contenedor = null;
}
