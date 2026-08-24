import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { abrirModal } from '../ui/modal.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { etiquetaPlazo, estaVencida } from '../utils/fechas.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import { crearTabla } from '../ui/tabla.js';
import { ESTADO_TAREA_LABEL, nombreCompleto, escapeHtml } from '../utils/formato.js';
import { puedeAprobarODevolver, puedeMarcarNoAplica } from '../core/permisos.js';

let contenedor = null;
let tareas = [];

async function cargar() {
  const { data, error } = await supabase
    .from('tareas')
    .select(`
      id, titulo, estado, fecha_limite, progreso, responsable_cargo_id, supervisor_cargo_id,
      actividad:actividades(codigo, nombre),
      responsable:cargos!tareas_responsable_cargo_id_fkey(nombre, persona:personas!cargos_persona_id_fkey(nombre, apellido))
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

// Bloque C — activa estado_tarea.no_aplica (existe desde 0001, autoridad ya
// construida en fn_transicion_estado_tarea desde 0004, ningún botón lo
// disparaba hasta ahora). Sin modal: no existe columna de motivo para esta
// transición en la base, y no se inventa una.
export async function marcarNoAplica(tarea, alTerminar) {
  const { error } = await supabase.from('tareas').update({ estado: 'no_aplica' }).eq('id', tarea.id);
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return;
  }
  mostrarAviso('Tarea marcada como no aplica.', 'exito');
  await (alTerminar || recargar)();
}

function columnasBandeja() {
  return [
    {
      clave: 'titulo',
      titulo: 'Tarea',
      html: true,
      render: (t) => `<a href="/tarea.html?id=${t.id}">${escapeHtml(t.titulo)}</a>${t.actividad ? `<div class="texto-mudo texto-pequeno">${escapeHtml(t.actividad.codigo)}</div>` : ''}`,
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      html: true,
      render: (t) => `<span class="estado estado--${t.estado.replace(/_/g, '-')}">${ESTADO_TAREA_LABEL[t.estado]}</span>`,
    },
    {
      clave: 'responsable',
      titulo: 'Responsable',
      render: (t) => nombreCompleto(t.responsable?.persona),
      ordenarPor: (t) => nombreCompleto(t.responsable?.persona),
    },
    {
      clave: 'fecha_limite',
      titulo: 'Plazo',
      html: true,
      render: (t) => `<span${estaVencida(t) ? ' class="texto-danger"' : ''}>${etiquetaPlazo(t)}</span>`,
    },
    { clave: 'acciones', titulo: '' },
  ];
}

function adjuntarAcciones(tabla, lista) {
  const { sesion } = getEstado();
  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const tarea = lista[i];
    if (!tarea) return;
    const td = tr.querySelector('td:last-child');
    td.className = 'tabla__acciones';

    if (tarea.estado === 'en_revision' && puedeAprobarODevolver(sesion, tarea)) {
      const aprobarBtn = document.createElement('button');
      aprobarBtn.type = 'button';
      aprobarBtn.className = 'boton boton--primario boton--pequeno';
      aprobarBtn.innerHTML = icono('check', { tamano: 14 });
      aprobarBtn.title = 'Aprobar';
      aprobarBtn.addEventListener('click', () => aprobar(tarea));

      const devolverBtn = document.createElement('button');
      devolverBtn.type = 'button';
      devolverBtn.className = 'boton boton--secundario boton--pequeno';
      devolverBtn.textContent = 'Devolver';
      devolverBtn.addEventListener('click', () => abrirHojaDevolucion(tarea, recargar));

      td.append(aprobarBtn, devolverBtn);
    } else {
      const verBtn = document.createElement('button');
      verBtn.type = 'button';
      verBtn.className = 'boton boton--fantasma boton--pequeno';
      verBtn.textContent = 'Ver';
      verBtn.addEventListener('click', () => { location.href = `/tarea.html?id=${tarea.id}`; });
      td.appendChild(verBtn);
    }

    if (puedeMarcarNoAplica(sesion, tarea)) {
      const noAplicaBtn = document.createElement('button');
      noAplicaBtn.type = 'button';
      noAplicaBtn.className = 'boton boton--fantasma boton--pequeno';
      noAplicaBtn.textContent = 'No aplica';
      noAplicaBtn.addEventListener('click', () => marcarNoAplica(tarea, recargar));
      td.appendChild(noAplicaBtn);
    }
  });
}

function pintar() {
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  if (tareas.length === 0) {
    cuerpo.innerHTML = '<p class="estado-vacio">Bandeja al día: no hay tareas en revisión ni vencidas.</p>';
    return;
  }
  const ordenadas = [...tareas].sort((a, b) => orden(a) - orden(b));
  const tabla = crearTabla(columnasBandeja(), ordenadas);
  adjuntarAcciones(tabla, ordenadas);
  cuerpo.innerHTML = '';
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
    <div data-cuerpo>${esqueletoTabla()}</div>
  `;
  await recargar();
}

export function destroy() {
  contenedor = null;
}
