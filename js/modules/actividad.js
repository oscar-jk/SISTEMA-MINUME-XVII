import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { navegar } from '../core/router.js';
import { abrirModal } from '../ui/modal.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { opcionesSelect } from '../ui/formulario.js';
import { formatoLargo, formatoHora } from '../utils/fechas.js';
import {
  ESTADO_TAREA_LABEL, ESTADO_ACTIVIDAD_LABEL, PRIORIDAD_LABEL,
  nombreCompleto, escapeHtml,
} from '../utils/formato.js';
import { puedeAsignar } from '../core/permisos.js';

let contenedor = null;
let idActividad = null;

async function cargarActividad(id) {
  const { data, error } = await supabase.from('actividades').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function cargarTareas(actividadId) {
  const { data, error } = await supabase
    .from('tareas')
    .select(`
      id, titulo, estado, progreso, fecha_limite,
      responsable:cargos!tareas_responsable_cargo_id_fkey(id, nombre, persona:personas(nombre, apellido)),
      supervisor:cargos!tareas_supervisor_cargo_id_fkey(id, nombre, persona:personas(nombre, apellido))
    `)
    .eq('actividad_id', actividadId)
    .order('creada_en');
  if (error) throw error;
  return data;
}

async function cargarCargosVisibles() {
  const { data, error } = await supabase
    .from('cargos')
    .select('id, nombre, tipo, persona:personas(nombre, apellido)')
    .eq('activo', true)
    .order('nombre');
  if (error) return [];
  return data.filter((c) => c.persona);
}

function abrirModalDespliegue(actividad, cargos, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <p class="texto-mudo">Se crearán ${actividad.dotacion_requerida} tareas ligadas a esta actividad, listas para asignar responsable.</p>
    <form class="formulario" data-form>
      <label class="campo">
        <span>Supervisor de estas tareas</span>
        <select name="supervisor" required>${opcionesSelect(cargos, { valor: 'id', etiqueta: (c) => `${nombreCompleto(c.persona)} · ${c.nombre}`, vacio: 'Elige un supervisor' })}</select>
      </label>
      <button type="submit" class="boton boton--primario boton--ancho">Desplegar ${actividad.dotacion_requerida} tareas</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: 'Desplegar tareas', contenido: div, ancho: 'angosto' });

  div.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const supervisor = new FormData(e.target).get('supervisor');
    const { data, error } = await supabase.rpc('fn_desplegar_actividad', {
      p_actividad: actividad.id,
      p_supervisor: supervisor,
      p_titulos: null,
    });
    if (error) {
      mostrarAviso(mensajeError(error), 'error');
      return;
    }
    mostrarAviso(`${data.length} tareas creadas. Asígnales responsable en la tabla.`, 'exito');
    cerrar();
    alTerminar();
  });
}

function celdaAsignar(tarea, campo, cargos, alCambiar) {
  // El responsable puede quedar sin asignar (la columna es nullable);
  // el supervisor no, porque `tareas.supervisor_cargo_id` es NOT NULL.
  const permiteVacio = campo === 'responsable';
  const select = document.createElement('select');
  select.className = 'select-inline';
  select.required = !permiteVacio;
  select.innerHTML = opcionesSelect(cargos, {
    valor: 'id',
    etiqueta: (c) => `${nombreCompleto(c.persona)} · ${c.nombre}`,
    seleccionado: tarea[campo]?.id || '',
    vacio: permiteVacio ? 'Sin asignar' : null,
  });
  select.addEventListener('change', async () => {
    if (!select.value) return;
    const columna = campo === 'responsable' ? 'responsable_cargo_id' : 'supervisor_cargo_id';
    const { error } = await supabase.from('tareas').update({ [columna]: select.value }).eq('id', tarea.id);
    if (error) {
      mostrarAviso(mensajeError(error), 'error');
      return;
    }
    mostrarAviso('Actualizado.', 'exito');
    alCambiar();
  });
  return select;
}

function filaTarea(tarea, cargos, alCambiar) {
  const tr = document.createElement('tr');
  const tdTitulo = document.createElement('td');
  tdTitulo.innerHTML = `<a href="#/tarea/${tarea.id}">${escapeHtml(tarea.titulo)}</a>`;
  const tdEstado = document.createElement('td');
  tdEstado.innerHTML = `<span class="${'estado estado--' + tarea.estado.replace(/_/g, '-')}">${ESTADO_TAREA_LABEL[tarea.estado]}</span>`;
  const tdProgreso = document.createElement('td');
  tdProgreso.textContent = `${tarea.progreso}%`;
  const tdResponsable = document.createElement('td');
  tdResponsable.appendChild(celdaAsignar(tarea, 'responsable', cargos, alCambiar));
  const tdSupervisor = document.createElement('td');
  tdSupervisor.appendChild(celdaAsignar(tarea, 'supervisor', cargos, alCambiar));

  tr.append(tdTitulo, tdEstado, tdProgreso, tdResponsable, tdSupervisor);
  return tr;
}

async function pintar() {
  const { sesion } = getEstado();
  let actividad;
  let tareas;
  try {
    actividad = await cargarActividad(idActividad);
    tareas = await cargarTareas(idActividad);
  } catch (err) {
    contenedor.innerHTML = `<p class="estado-vacio">No se pudo cargar la actividad. ${escapeHtml(mensajeError(err))}</p>`;
    return;
  }

  const completadas = tareas.filter((t) => t.estado === 'completada').length;
  const puede = puedeAsignar(sesion);

  contenedor.innerHTML = `
    <button type="button" class="boton boton--fantasma" data-volver>${icono('flecha-izq', { tamano: 16 })} Volver al calendario</button>
    <div class="vista-cabecera">
      <div>
        <span class="${'estado estado--' + actividad.estado.replace(/_/g, '-')}">${ESTADO_ACTIVIDAD_LABEL[actividad.estado]}</span>
        <span class="${'prioridad prioridad--' + actividad.prioridad}">${PRIORIDAD_LABEL[actividad.prioridad]}</span>
        <h1>${escapeHtml(actividad.codigo)} · ${escapeHtml(actividad.nombre)}</h1>
        <p class="texto-mudo">${formatoLargo(actividad.fecha)}${actividad.hora_inicio ? ` · ${formatoHora(actividad.hora_inicio)}${actividad.hora_fin ? ` – ${formatoHora(actividad.hora_fin)}` : ''}` : ''}</p>
      </div>
    </div>

    ${actividad.descripcion ? `<p>${escapeHtml(actividad.descripcion)}</p>` : ''}

    <div class="ficha-datos">
      <div><span>Fase</span><strong>${escapeHtml(actividad.fase || '—')}</strong></div>
      <div><span>Área responsable</span><strong>${escapeHtml(actividad.area_responsable || '—')}</strong></div>
      <div><span>Riesgo</span><strong>${escapeHtml(actividad.riesgo)}</strong></div>
      <div><span>Tareas</span><strong>${completadas}/${tareas.length}${actividad.dotacion_requerida ? ` de ${actividad.dotacion_requerida} previstas` : ''}</strong></div>
    </div>

    ${actividad.plan_b ? `<div class="aviso-inline aviso-inline--alerta">${icono('alerta', { tamano: 16 })} <div><strong>Plan B</strong><p>${escapeHtml(actividad.plan_b)}</p></div></div>` : ''}

    <div class="vista-cabecera">
      <h2 class="subtitulo">Tareas</h2>
      ${puede && tareas.length < actividad.dotacion_requerida ? `<button type="button" class="boton boton--primario" data-desplegar>${icono('mas', { tamano: 16 })} Desplegar tareas</button>` : ''}
    </div>

    <div class="tabla-envoltorio" data-tabla></div>
  `;

  contenedor.querySelector('[data-volver]').addEventListener('click', () => navegar('#/calendario'));

  const desplegarBtn = contenedor.querySelector('[data-desplegar]');
  if (desplegarBtn) {
    desplegarBtn.addEventListener('click', async () => {
      const cargos = await cargarCargosVisibles();
      abrirModalDespliegue(actividad, cargos, pintar);
    });
  }

  const tablaEl = contenedor.querySelector('[data-tabla]');
  if (tareas.length === 0) {
    tablaEl.innerHTML = '<p class="estado-vacio">Todavía no se han desplegado tareas para esta actividad.</p>';
  } else {
    const cargos = await cargarCargosVisibles();
    const tabla = document.createElement('table');
    tabla.className = 'tabla';
    tabla.innerHTML = '<thead><tr><th>Título</th><th>Estado</th><th>Progreso</th><th>Responsable</th><th>Supervisor</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const t of tareas) tbody.appendChild(filaTarea(t, cargos, pintar));
    tabla.appendChild(tbody);
    tablaEl.appendChild(tabla);
  }
}

export async function render(el, params) {
  contenedor = el;
  idActividad = params.id;
  el.innerHTML = '<p class="estado-vacio">Cargando…</p>';
  await pintar();
}

export function destroy() {
  contenedor = null;
  idActividad = null;
}
