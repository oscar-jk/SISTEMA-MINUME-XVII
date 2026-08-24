// Mis tareas — lo primero que ve un voluntario al entrar.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { encolarAvance } from '../core/cola.js';
import { abrirModal } from '../ui/modal.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import {
  estaVencida, etiquetaPlazo,
} from '../utils/fechas.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import { crearTabla } from '../ui/tabla.js';
import {
  ESTADO_TAREA_LABEL, PRIORIDAD_LABEL, esPrioridadAlta, escapeHtml, nombreCompleto,
} from '../utils/formato.js';
import { puedeRegistrarAvance, puedeEnviarRevision, puedeTomarTarea } from '../core/permisos.js';

let contenedor = null;
let tareasCache = [];
let tareasGrupoCache = [];
let filtroActivo = 'todas';

function urgenciaOrden(t) {
  if (estaVencida(t)) return 0;
  if (t.estado === 'en_revision') return 3;
  if (!t.fecha_limite) return 4;
  return 1;
}

function ordenarPorUrgencia(lista) {
  return [...lista].sort((a, b) => {
    const oa = urgenciaOrden(a);
    const ob = urgenciaOrden(b);
    if (oa !== ob) return oa - ob;
    if (a.fecha_limite && b.fecha_limite) return a.fecha_limite.localeCompare(b.fecha_limite);
    if (a.fecha_limite) return -1;
    if (b.fecha_limite) return 1;
    return 0;
  });
}

async function cargar() {
  const { sesion } = getEstado();
  if (!sesion) return [];
  const { data, error } = await supabase
    .from('tareas')
    .select('id, titulo, descripcion, estado, prioridad, fecha_limite, progreso, responsable_cargo_id, supervisor_cargo_id, actividad:actividades(nombre, codigo)')
    .eq('responsable_cargo_id', sesion.cargo.id)
    .order('fecha_limite', { ascending: true, nullsFirst: false });

  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return [];
  }
  return data;
}

// Bloque A — todas las tareas dirigidas a mi grupo de trabajo, tomadas o
// no. A diferencia de cargar() (mis tareas, responsable_cargo_id = mi
// cargo), aquí el filtro es por grupo, no por responsable: es visibilidad
// de equipo, no una bandeja personal.
async function cargarGrupo() {
  const { sesion } = getEstado();
  if (!sesion?.cargo.grupo_trabajo_id) return [];
  const { data, error } = await supabase
    .from('tareas')
    .select('id, titulo, descripcion, estado, prioridad, fecha_limite, progreso, responsable_cargo_id, supervisor_cargo_id, grupo_trabajo_id, responsable:cargos!tareas_responsable_cargo_id_fkey(nombre, persona:personas!cargos_persona_id_fkey(nombre, apellido))')
    .eq('grupo_trabajo_id', sesion.cargo.grupo_trabajo_id)
    .order('fecha_limite', { ascending: true, nullsFirst: false });

  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return [];
  }
  return data;
}

// Bloque A — tomar (cargoId) o liberar (null) una tarea de grupo. Un
// UPDATE directo, gateado por RLS + fn_toma_voluntaria_tarea (0035): igual
// que grupos-trabajo.js añade/quita miembros con un simple .update() en
// vez de una función dedicada. 0 filas devueltas (sin error) significa que
// alguien más se adelantó — condición de carrera esperada, no una falla.
export async function establecerResponsableGrupo(tarea, cargoIdONull, alTerminar) {
  const { data, error } = await supabase
    .from('tareas')
    .update({ responsable_cargo_id: cargoIdONull })
    .eq('id', tarea.id)
    .select('id');

  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return;
  }
  if (!data || data.length === 0) {
    mostrarAviso('Ya no se puede — alguien más se adelantó, o la tarea cambió mientras tanto.', 'error');
    (alTerminar || recargarSilencioso)();
    return;
  }
  mostrarAviso(cargoIdONull ? 'Tarea tomada.' : 'Tarea liberada.', 'exito');
  (alTerminar || recargarSilencioso)();
}

export function abrirHojaAvance(tarea, alGuardar) {
  const sugerido = Math.min(100, (tarea.progreso || 0) + 10) || 20;
  const div = document.createElement('div');
  div.className = 'hoja-avance';
  div.innerHTML = `
    <p class="hoja-avance__tarea">${escapeHtml(tarea.titulo)}</p>
    <label class="campo">
      <span>Progreso: <b data-valor>${sugerido}%</b></span>
      <input type="range" min="0" max="100" step="5" value="${sugerido}" name="progreso_reportado" class="deslizador" />
    </label>
    <label class="campo">
      <span>Nota (opcional)</span>
      <textarea name="nota" rows="3" placeholder="¿Qué avanzaste?"></textarea>
    </label>
    <button type="button" class="boton boton--primario boton--ancho" data-guardar>
      ${icono('check', { tamano: 18 })} Guardar avance
    </button>
  `;

  const deslizador = div.querySelector('.deslizador');
  const valorTexto = div.querySelector('[data-valor]');
  deslizador.addEventListener('input', () => { valorTexto.textContent = `${deslizador.value}%`; });

  const { cerrar } = abrirModal({ titulo: 'Registrar avance', contenido: div, ancho: 'angosto' });

  div.querySelector('[data-guardar]').addEventListener('click', () => {
    const { sesion } = getEstado();
    encolarAvance({
      tarea_id: tarea.id,
      autor_cargo_id: sesion.cargo.id,
      nota: div.querySelector('[name="nota"]').value.trim() || null,
      progreso_reportado: Number(deslizador.value),
    });
    mostrarAviso('Avance guardado. Se sincroniza automáticamente.', 'exito');
    cerrar();
    // Optimista: refleja el nuevo progreso de inmediato en la lista.
    tarea.progreso = Number(deslizador.value);
    if (tarea.estado === 'no_iniciada') tarea.estado = 'en_curso';
    alGuardar();
  });
}

export async function enviarARevision(tarea, alTerminar) {
  const { error } = await supabase.from('tareas').update({ estado: 'en_revision' }).eq('id', tarea.id);
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return;
  }
  tarea.estado = 'en_revision';
  mostrarAviso('Tarea enviada a revisión.', 'exito');
  (alTerminar || pintar)();
}

// K.4: tabla densa y ordenable en vez de tarjetas — en móvil, css/componentes.css
// apila la misma tabla como tarjetas (ver la media query junto a .tabla),
// así que no hay una segunda plantilla de tarjeta que mantener aparte.
function columnasTareas() {
  return [
    {
      clave: 'estado',
      titulo: 'Estado',
      html: true,
      render: (t) => `<span class="estado estado--${t.estado.replace(/_/g, '-')}">${ESTADO_TAREA_LABEL[t.estado]}</span>`,
    },
    {
      clave: 'prioridad',
      titulo: 'Prioridad',
      html: true,
      render: (t) => (esPrioridadAlta(t.prioridad) ? `<span class="prioridad prioridad--${t.prioridad}">${PRIORIDAD_LABEL[t.prioridad]}</span>` : '—'),
    },
    { clave: 'titulo', titulo: 'Tarea' },
    {
      clave: 'actividad',
      titulo: 'Actividad',
      render: (t) => (t.actividad ? `${t.actividad.codigo} · ${t.actividad.nombre}` : '—'),
      ordenarPor: (t) => t.actividad?.codigo || '',
    },
    {
      clave: 'fecha_limite',
      titulo: 'Plazo',
      html: true,
      render: (t) => `<span${estaVencida(t) ? ' class="texto-danger"' : ''}>${etiquetaPlazo(t)}</span>`,
    },
    {
      clave: 'progreso',
      titulo: 'Progreso',
      html: true,
      render: (t) => `<div class="progreso-fila"><div class="barra-progreso barra-progreso--pequena"><div class="barra-progreso__relleno" style="width:${t.progreso}%"></div></div><span class="progreso-valor">${t.progreso}%</span></div>`,
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

    if (puedeRegistrarAvance(sesion, tarea)) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'boton boton--primario boton--pequeno';
      boton.innerHTML = `${icono('mas', { tamano: 14 })} Avance`;
      boton.addEventListener('click', () => abrirHojaAvance(tarea, pintar));
      td.appendChild(boton);
    }

    if (puedeEnviarRevision(sesion, tarea)) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'boton boton--secundario boton--pequeno';
      boton.textContent = 'Enviar a revisión';
      boton.addEventListener('click', () => enviarARevision(tarea));
      td.appendChild(boton);
    }

    const verMas = document.createElement('button');
    verMas.type = 'button';
    verMas.className = 'boton boton--fantasma boton--pequeno';
    verMas.textContent = 'Ver detalle';
    verMas.addEventListener('click', () => { location.href = `/tarea.html?id=${tarea.id}`; });
    td.appendChild(verMas);
  });
}

function pintar() {
  if (!contenedor) return;
  const lista = filtroActivo === 'todas' ? tareasCache
    : filtroActivo === 'vencidas' ? tareasCache.filter(estaVencida)
    : tareasCache.filter((t) => t.estado === filtroActivo);

  const cuerpo = contenedor.querySelector('[data-lista]');
  if (lista.length === 0) {
    cuerpo.innerHTML = filtroActivo === 'todas' && tareasCache.length === 0
      ? '<div class="estado-vacio"><div>Todavía no tienes tareas asignadas.</div><div class="texto-pequeno">Cuando tu supervisor te asigne una, aparece aquí.</div></div>'
      : '<p class="estado-vacio">No hay tareas con este filtro.</p>';
    return;
  }

  const ordenada = ordenarPorUrgencia(lista);
  const tabla = crearTabla(columnasTareas(), ordenada);
  adjuntarAcciones(tabla, ordenada);
  cuerpo.innerHTML = '';
  cuerpo.appendChild(tabla);
}

// Bloque A — mismas columnas que columnasTareas(), cambiando "Actividad"
// por "Responsable" (aquí lo que importa es quién la tiene, o si está
// disponible para tomar — no de qué actividad viene).
function columnasTareasGrupo() {
  return [
    {
      clave: 'estado',
      titulo: 'Estado',
      html: true,
      render: (t) => `<span class="estado estado--${t.estado.replace(/_/g, '-')}">${ESTADO_TAREA_LABEL[t.estado]}</span>`,
    },
    {
      clave: 'prioridad',
      titulo: 'Prioridad',
      html: true,
      render: (t) => (esPrioridadAlta(t.prioridad) ? `<span class="prioridad prioridad--${t.prioridad}">${PRIORIDAD_LABEL[t.prioridad]}</span>` : '—'),
    },
    { clave: 'titulo', titulo: 'Tarea' },
    {
      clave: 'responsable',
      titulo: 'Responsable',
      html: true,
      render: (t) => (t.responsable ? escapeHtml(nombreCompleto(t.responsable.persona)) : '<span class="texto-mudo">Disponible</span>'),
      ordenarPor: (t) => (t.responsable ? nombreCompleto(t.responsable.persona) : ''),
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

function adjuntarAccionesGrupo(tabla, lista) {
  const { sesion } = getEstado();
  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const tarea = lista[i];
    if (!tarea) return;
    const td = tr.querySelector('td:last-child');
    td.className = 'tabla__acciones';

    if (puedeTomarTarea(sesion, tarea)) {
      const tomando = tarea.responsable_cargo_id === null;
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = `boton boton--pequeno ${tomando ? 'boton--primario' : 'boton--secundario'}`;
      boton.textContent = tomando ? 'Tomar' : 'Liberar';
      boton.addEventListener('click', () => establecerResponsableGrupo(tarea, tomando ? sesion.cargo.id : null, recargarTodo));
      td.appendChild(boton);
    }

    const verMas = document.createElement('button');
    verMas.type = 'button';
    verMas.className = 'boton boton--fantasma boton--pequeno';
    verMas.textContent = 'Ver detalle';
    verMas.addEventListener('click', () => { location.href = `/tarea.html?id=${tarea.id}`; });
    td.appendChild(verMas);
  });
}

function pintarGrupo() {
  if (!contenedor) return;
  const cuerpo = contenedor.querySelector('[data-lista-grupo]');
  if (!cuerpo) return; // sin grupo de trabajo: la sección ni se renderiza.

  if (tareasGrupoCache.length === 0) {
    cuerpo.innerHTML = '<p class="estado-vacio">Todavía no hay tareas para tu grupo.</p>';
    return;
  }

  const ordenada = ordenarPorUrgencia(tareasGrupoCache);
  const tabla = crearTabla(columnasTareasGrupo(), ordenada);
  adjuntarAccionesGrupo(tabla, ordenada);
  cuerpo.innerHTML = '';
  cuerpo.appendChild(tabla);
}

const FILTROS_VALIDOS = new Set(['todas', 'vencidas', 'en_curso', 'en_revision', 'completada']);

// filtroInicial viene del tablero (?filtro=vencidas, por ejemplo) — un
// enlace directo a la pestaña correspondiente en vez de aterrizar siempre
// en "Todas" y obligar a un segundo clic.
export async function render(el, filtroInicial) {
  contenedor = el;
  filtroActivo = FILTROS_VALIDOS.has(filtroInicial) ? filtroInicial : 'todas';
  const { sesion } = getEstado();
  el.innerHTML = `
    <div class="vista-cabecera">
      <h1>Mis tareas</h1>
      <div class="filtros-chip" data-filtros>
        <button type="button" class="chip${filtroActivo === 'todas' ? ' chip--activo' : ''}" data-filtro="todas">Todas</button>
        <button type="button" class="chip${filtroActivo === 'vencidas' ? ' chip--activo' : ''}" data-filtro="vencidas">Vencidas</button>
        <button type="button" class="chip${filtroActivo === 'en_curso' ? ' chip--activo' : ''}" data-filtro="en_curso">En curso</button>
        <button type="button" class="chip${filtroActivo === 'en_revision' ? ' chip--activo' : ''}" data-filtro="en_revision">En revisión</button>
        <button type="button" class="chip${filtroActivo === 'completada' ? ' chip--activo' : ''}" data-filtro="completada">Completadas</button>
      </div>
    </div>
    <div data-lista>${esqueletoTabla()}</div>
    ${sesion.cargo.grupo_trabajo_id ? `
      <h2 class="subtitulo">Tareas de mi grupo</h2>
      <div data-lista-grupo>${esqueletoTabla()}</div>
    ` : ''}
  `;

  el.querySelector('[data-filtros]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]');
    if (!btn) return;
    filtroActivo = btn.dataset.filtro;
    el.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--activo', c === btn));
    pintar();
  });

  [tareasCache, tareasGrupoCache] = await Promise.all([cargar(), cargarGrupo()]);
  pintar();
  pintarGrupo();

  window.addEventListener('minume:avance-sincronizado', recargarSilencioso);
}

async function recargarSilencioso() {
  tareasCache = await cargar();
  pintar();
}

// Bloque A — tomar/liberar puede mover una tarea dentro o fuera de "mis
// tareas" (responsable_cargo_id cambia a mi cargo o vuelve a null), así
// que refresca ambas secciones, no solo la de grupo.
async function recargarTodo() {
  [tareasCache, tareasGrupoCache] = await Promise.all([cargar(), cargarGrupo()]);
  pintar();
  pintarGrupo();
}

export function destroy() {
  contenedor = null;
  window.removeEventListener('minume:avance-sincronizado', recargarSilencioso);
}
