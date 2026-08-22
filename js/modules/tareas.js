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
import {
  ESTADO_TAREA_LABEL, esPrioridadAlta, escapeHtml,
} from '../utils/formato.js';
import { puedeRegistrarAvance, puedeEnviarRevision } from '../core/permisos.js';

let contenedor = null;
let tareasCache = [];
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

function abrirHojaAvance(tarea, alGuardar) {
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

async function enviarARevision(tarea) {
  const { error } = await supabase.from('tareas').update({ estado: 'en_revision' }).eq('id', tarea.id);
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return;
  }
  tarea.estado = 'en_revision';
  mostrarAviso('Tarea enviada a revisión.', 'exito');
  pintar();
}

function tarjeta(tarea) {
  const { sesion } = getEstado();
  const vencida = estaVencida(tarea);
  const art = document.createElement('article');
  art.className = `tarjeta-tarea${vencida ? ' tarjeta-tarea--vencida' : ''}`;

  const marcador = esPrioridadAlta(tarea.prioridad) ? icono('estrella', { tamano: 14, clase: 'marcador-prioridad' }) : '';

  art.innerHTML = `
    <div class="tarjeta-tarea__cima">
      <span class="${'estado estado--' + tarea.estado.replace(/_/g, '-')}">${ESTADO_TAREA_LABEL[tarea.estado]}</span>
      <span class="tarjeta-tarea__plazo${vencida ? ' texto-danger' : ''}">${etiquetaPlazo(tarea)}</span>
    </div>
    <h3 class="tarjeta-tarea__titulo">${marcador}${escapeHtml(tarea.titulo)}</h3>
    ${tarea.actividad ? `<p class="tarjeta-tarea__actividad">${escapeHtml(tarea.actividad.codigo)} · ${escapeHtml(tarea.actividad.nombre)}</p>` : ''}
    <div class="barra-progreso"><div class="barra-progreso__relleno" style="width:${tarea.progreso}%"></div></div>
    <div class="tarjeta-tarea__acciones"></div>
  `;

  const acciones = art.querySelector('.tarjeta-tarea__acciones');

  if (puedeRegistrarAvance(sesion, tarea)) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton boton--primario';
    boton.innerHTML = `${icono('mas', { tamano: 16 })} Registrar avance`;
    boton.addEventListener('click', () => abrirHojaAvance(tarea, pintar));
    acciones.appendChild(boton);
  }

  if (puedeEnviarRevision(sesion, tarea)) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton boton--secundario';
    boton.textContent = 'Enviar a revisión';
    boton.addEventListener('click', () => enviarARevision(tarea));
    acciones.appendChild(boton);
  }

  const verMas = document.createElement('button');
  verMas.type = 'button';
  verMas.className = 'boton boton--fantasma';
  verMas.textContent = 'Ver detalle';
  verMas.addEventListener('click', () => { location.href = `/tarea.html?id=${tarea.id}`; });
  acciones.appendChild(verMas);

  return art;
}

function pintar() {
  if (!contenedor) return;
  const lista = filtroActivo === 'todas' ? tareasCache
    : filtroActivo === 'vencidas' ? tareasCache.filter(estaVencida)
    : tareasCache.filter((t) => t.estado === filtroActivo);

  const cuerpo = contenedor.querySelector('[data-lista]');
  cuerpo.innerHTML = '';
  if (lista.length === 0) {
    cuerpo.innerHTML = '<p class="estado-vacio">No hay tareas en este filtro.</p>';
    return;
  }
  for (const tarea of ordenarPorUrgencia(lista)) {
    cuerpo.appendChild(tarjeta(tarea));
  }
}

const FILTROS_VALIDOS = new Set(['todas', 'vencidas', 'en_curso', 'en_revision', 'completada']);

// filtroInicial viene del tablero (?filtro=vencidas, por ejemplo) — un
// enlace directo a la pestaña correspondiente en vez de aterrizar siempre
// en "Todas" y obligar a un segundo clic.
export async function render(el, filtroInicial) {
  contenedor = el;
  filtroActivo = FILTROS_VALIDOS.has(filtroInicial) ? filtroInicial : 'todas';
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
    <div class="lista-tareas" data-lista><p class="estado-vacio">Cargando…</p></div>
  `;

  el.querySelector('[data-filtros]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]');
    if (!btn) return;
    filtroActivo = btn.dataset.filtro;
    el.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--activo', c === btn));
    pintar();
  });

  tareasCache = await cargar();
  pintar();

  window.addEventListener('minume:avance-sincronizado', recargarSilencioso);
}

async function recargarSilencioso() {
  tareasCache = await cargar();
  pintar();
}

export function destroy() {
  contenedor = null;
  window.removeEventListener('minume:avance-sincronizado', recargarSilencioso);
}
