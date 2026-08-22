import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { navegar } from '../core/router.js';
import { abrirModal } from '../ui/modal.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import {
  matrizMes, nombreMes, hoyISO, inicioSemana, sumarDias, NOMBRES_DIA_CORTO, formatoCorto,
} from '../utils/fechas.js';
import {
  ESTADO_ACTIVIDAD_LABEL, PRIORIDAD_LABEL, escapeHtml, esPrioridadAlta,
} from '../utils/formato.js';
import { puedeAsignar } from '../core/permisos.js';

let contenedor = null;
let vista = 'mes'; // mes | semana | lista
let cursor = hoyISO();
let actividades = [];
let conteos = new Map(); // actividad_id -> { total, completadas }
let filtros = { fase: '', area: '', estado: '', prioridad: '' };

function esMovil() {
  return window.matchMedia('(max-width: 767px)').matches;
}

async function cargarRango(desde, hasta) {
  const { data, error } = await supabase
    .from('actividades')
    .select('id, codigo, nombre, fecha, fase, area_responsable, prioridad, estado, dotacion_requerida')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha');
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return [];
  }
  return data;
}

async function cargarConteos(idsActividad) {
  if (idsActividad.length === 0) return new Map();
  const { data, error } = await supabase
    .from('tareas')
    .select('actividad_id, estado')
    .in('actividad_id', idsActividad);
  if (error) return new Map();

  const mapa = new Map();
  for (const t of data) {
    if (!t.actividad_id) continue;
    const actual = mapa.get(t.actividad_id) || { total: 0, completadas: 0 };
    actual.total++;
    if (t.estado === 'completada') actual.completadas++;
    mapa.set(t.actividad_id, actual);
  }
  return mapa;
}

function aplicarFiltros(lista) {
  return lista.filter((a) => (
    (!filtros.fase || a.fase === filtros.fase)
    && (!filtros.area || a.area_responsable === filtros.area)
    && (!filtros.estado || a.estado === filtros.estado)
    && (!filtros.prioridad || a.prioridad === filtros.prioridad)
  ));
}

function chipActividad(act) {
  const c = conteos.get(act.id) || { total: 0, completadas: 0 };
  const marcador = esPrioridadAlta(act.prioridad) ? icono('estrella', { tamano: 11 }) : '';
  const div = document.createElement('button');
  div.type = 'button';
  div.className = `chip-actividad estado-${act.estado.replace(/_/g, '-')}`;
  div.innerHTML = `${marcador}<span class="chip-actividad__nombre">${escapeHtml(act.nombre)}</span>${act.dotacion_requerida ? `<span class="chip-actividad__conteo">${c.completadas}/${c.total || act.dotacion_requerida}</span>` : ''}`;
  div.addEventListener('click', () => navegar(`#/actividad/${act.id}`));
  return div;
}

function vistaMesHtml() {
  const [anio, mes] = cursor.split('-').map(Number);
  const semanas = matrizMes(anio, mes - 1);
  const porFecha = new Map();
  for (const a of aplicarFiltros(actividades)) {
    if (!porFecha.has(a.fecha)) porFecha.set(a.fecha, []);
    porFecha.get(a.fecha).push(a);
  }

  const grilla = document.createElement('div');
  grilla.className = 'calendario-mes';
  grilla.innerHTML = `<div class="calendario-mes__dias-semana">${NOMBRES_DIA_CORTO.map((d) => `<span>${d}</span>`).join('')}</div>`;

  const cuerpo = document.createElement('div');
  cuerpo.className = 'calendario-mes__cuerpo';
  for (const semana of semanas) {
    for (const dia of semana) {
      const celda = document.createElement('div');
      celda.className = `calendario-mes__dia${dia.enMes ? '' : ' calendario-mes__dia--fuera'}${dia.esHoy ? ' calendario-mes__dia--hoy' : ''}`;
      celda.innerHTML = `<span class="calendario-mes__numero">${Number(dia.fecha.split('-')[2])}</span>`;
      const items = porFecha.get(dia.fecha) || [];
      for (const act of items.slice(0, 3)) celda.appendChild(chipActividad(act));
      if (items.length > 3) {
        const mas = document.createElement('span');
        mas.className = 'calendario-mes__mas';
        mas.textContent = `+${items.length - 3} más`;
        celda.appendChild(mas);
      }
      cuerpo.appendChild(celda);
    }
  }
  grilla.appendChild(cuerpo);
  return grilla;
}

function vistaSemanaHtml() {
  const inicio = inicioSemana(cursor);
  const iso0 = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`;
  const porFecha = new Map();
  for (const a of aplicarFiltros(actividades)) {
    if (!porFecha.has(a.fecha)) porFecha.set(a.fecha, []);
    porFecha.get(a.fecha).push(a);
  }

  const cont = document.createElement('div');
  cont.className = 'calendario-semana';
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(iso0, i);
    const items = porFecha.get(fecha) || [];
    const columna = document.createElement('div');
    columna.className = 'calendario-semana__dia';
    columna.innerHTML = `<div class="calendario-semana__cabecera">${NOMBRES_DIA_CORTO[i]} <span>${formatoCorto(fecha)}</span></div>`;
    for (const act of items) columna.appendChild(chipActividad(act));
    if (items.length === 0) columna.innerHTML += '<p class="texto-mudo texto-pequeno">Sin actividades</p>';
    cont.appendChild(columna);
  }
  return cont;
}

function vistaListaHtml() {
  const porFecha = new Map();
  for (const a of aplicarFiltros(actividades)) {
    if (!porFecha.has(a.fecha)) porFecha.set(a.fecha, []);
    porFecha.get(a.fecha).push(a);
  }
  const fechas = [...porFecha.keys()].sort();

  const cont = document.createElement('div');
  cont.className = 'calendario-lista';
  if (fechas.length === 0) {
    cont.innerHTML = '<p class="estado-vacio">No hay actividades con estos filtros.</p>';
    return cont;
  }
  for (const fecha of fechas) {
    const seccion = document.createElement('section');
    seccion.className = 'calendario-lista__dia';
    seccion.innerHTML = `<h3>${formatoCorto(fecha)}</h3>`;
    for (const act of porFecha.get(fecha)) seccion.appendChild(chipActividad(act));
    cont.appendChild(seccion);
  }
  return cont;
}

function tituloRango() {
  if (vista === 'semana') {
    const inicio = inicioSemana(cursor);
    const iso0 = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`;
    return `Semana del ${formatoCorto(iso0)}`;
  }
  const [anio, mes] = cursor.split('-').map(Number);
  return `${nombreMes(mes - 1)} ${anio}`;
}

function rangoParaCarga() {
  if (vista === 'semana') {
    const iso0 = (() => {
      const i = inicioSemana(cursor);
      return `${i.getFullYear()}-${String(i.getMonth() + 1).padStart(2, '0')}-${String(i.getDate()).padStart(2, '0')}`;
    })();
    return [iso0, sumarDias(iso0, 6)];
  }
  const [anio, mes] = cursor.split('-').map(Number);
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return [desde, hasta];
}

function moverCursor(delta) {
  if (vista === 'semana') {
    cursor = sumarDias(cursor, delta * 7);
  } else {
    const [anio, mes] = cursor.split('-').map(Number);
    const d = new Date(anio, mes - 1 + delta, 1);
    cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
  cargarYPintar();
}

function abrirFormularioActividad() {
  const div = document.createElement('div');
  div.innerHTML = `
    <form class="formulario" data-form>
      <div class="formulario__fila">
        <label class="campo"><span>Código</span><input name="codigo" required placeholder="ACT-026" /></label>
        <label class="campo"><span>Fecha</span><input name="fecha" type="date" required value="${cursor}" /></label>
      </div>
      <label class="campo"><span>Nombre</span><input name="nombre" required /></label>
      <label class="campo"><span>Descripción</span><textarea name="descripcion" rows="2"></textarea></label>
      <div class="formulario__fila">
        <label class="campo"><span>Hora inicio</span><input name="hora_inicio" type="time" /></label>
        <label class="campo"><span>Hora fin</span><input name="hora_fin" type="time" /></label>
      </div>
      <div class="formulario__fila">
        <label class="campo"><span>Fase</span><input name="fase" placeholder="preparación / ejecución / cierre" /></label>
        <label class="campo"><span>Área responsable</span><input name="area_responsable" /></label>
      </div>
      <div class="formulario__fila">
        <label class="campo"><span>Dotación requerida</span><input name="dotacion_requerida" type="number" min="0" value="0" /></label>
        <label class="campo"><span>Prioridad</span><select name="prioridad">${opcionesSelect(Object.entries(PRIORIDAD_LABEL).map(([v, t]) => ({ v, t })), { valor: 'v', etiqueta: 't', seleccionado: 'media' })}</select></label>
      </div>
      <button type="submit" class="boton boton--primario boton--ancho">Crear actividad</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: 'Nueva actividad', contenido: div });

  div.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { sesion } = getEstado();
    const datos = datosFormulario(e.target);
    datos.dotacion_requerida = Number(datos.dotacion_requerida || 0);
    datos.creada_por = sesion.cargo.id;
    const { error } = await supabase.from('actividades').insert(datos);
    if (error) {
      mostrarAviso(mensajeError(error), 'error');
      return;
    }
    mostrarAviso('Actividad creada.', 'exito');
    cerrar();
    cargarYPintar();
  });
}

function abrirFormularioRefechado() {
  const div = document.createElement('div');
  div.innerHTML = `
    <p class="texto-mudo">La fecha del evento es tentativa. Esto mueve la fecha de cada actividad del rango y, junto con ella, la fecha límite de sus tareas.</p>
    <form class="formulario" data-form>
      <div class="formulario__fila">
        <label class="campo"><span>Desde</span><input name="desde" type="date" required /></label>
        <label class="campo"><span>Hasta</span><input name="hasta" type="date" required /></label>
      </div>
      <label class="campo"><span>Días a mover (negativo para adelantar)</span><input name="dias" type="number" required value="1" /></label>
      <button type="submit" class="boton boton--primario boton--ancho">Re-fechar rango</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: 'Re-fechar en bloque', contenido: div, ancho: 'angosto' });

  div.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const { data, error } = await supabase.rpc('fn_refechar_rango', {
      p_desde: datos.desde, p_hasta: datos.hasta, p_dias: Number(datos.dias),
    });
    if (error) {
      mostrarAviso(mensajeError(error), 'error');
      return;
    }
    mostrarAviso(`Listo. ${data} actividades quedaron en el nuevo rango de fechas.`, 'exito');
    cerrar();
    cargarYPintar();
  });
}

function pintarFiltros(el) {
  const fases = [...new Set(actividades.map((a) => a.fase).filter(Boolean))].sort();
  const areas = [...new Set(actividades.map((a) => a.area_responsable).filter(Boolean))].sort();

  el.innerHTML = `
    <select data-filtro="fase">${opcionesSelect(fases.map((f) => ({ f })), { valor: 'f', etiqueta: 'f', seleccionado: filtros.fase, vacio: 'Toda fase' })}</select>
    <select data-filtro="area">${opcionesSelect(areas.map((a) => ({ a })), { valor: 'a', etiqueta: 'a', seleccionado: filtros.area, vacio: 'Toda área' })}</select>
    <select data-filtro="estado">${opcionesSelect(Object.entries(ESTADO_ACTIVIDAD_LABEL).map(([v, t]) => ({ v, t })), { valor: 'v', etiqueta: 't', seleccionado: filtros.estado, vacio: 'Todo estado' })}</select>
    <select data-filtro="prioridad">${opcionesSelect(Object.entries(PRIORIDAD_LABEL).map(([v, t]) => ({ v, t })), { valor: 'v', etiqueta: 't', seleccionado: filtros.prioridad, vacio: 'Toda prioridad' })}</select>
  `;
  el.querySelectorAll('select').forEach((s) => {
    s.addEventListener('change', () => {
      filtros[s.dataset.filtro] = s.value;
      pintarCuerpo();
    });
  });
}

function pintarCuerpo() {
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  cuerpo.innerHTML = '';
  const usarLista = vista === 'lista' || esMovil();
  if (usarLista) cuerpo.appendChild(vistaListaHtml());
  else if (vista === 'semana') cuerpo.appendChild(vistaSemanaHtml());
  else cuerpo.appendChild(vistaMesHtml());

  const titulo = contenedor.querySelector('[data-titulo]');
  if (titulo) titulo.textContent = tituloRango();
}

async function cargarYPintar() {
  const [desde, hasta] = rangoParaCarga();
  actividades = await cargarRango(desde, hasta);
  conteos = await cargarConteos(actividades.map((a) => a.id));
  pintarCuerpo();
  const filtrosEl = contenedor.querySelector('[data-filtros]');
  if (filtrosEl) pintarFiltros(filtrosEl);
}

export async function render(el) {
  contenedor = el;
  const { sesion } = getEstado();

  el.innerHTML = `
    <div class="vista-cabecera">
      <h1>Calendario</h1>
      <div class="calendario-acciones">
        ${puedeAsignar(sesion) ? `<button type="button" class="boton boton--secundario" data-refechar>${icono('reloj', { tamano: 16 })} Re-fechar rango</button>` : ''}
        ${puedeAsignar(sesion) ? `<button type="button" class="boton boton--primario" data-nueva>${icono('mas', { tamano: 16 })} Nueva actividad</button>` : ''}
      </div>
    </div>

    <div class="calendario-controles">
      <div class="calendario-navegacion">
        <button type="button" class="boton-icono" data-anterior>${icono('flecha-izq', { tamano: 18 })}</button>
        <span data-titulo class="calendario-titulo"></span>
        <button type="button" class="boton-icono" data-siguiente>${icono('flecha-der', { tamano: 18 })}</button>
      </div>
      <div class="calendario-vistas">
        <button type="button" class="chip chip--activo" data-vista="mes">Mes</button>
        <button type="button" class="chip" data-vista="semana">Semana</button>
        <button type="button" class="chip" data-vista="lista">Lista</button>
      </div>
    </div>

    <div class="calendario-filtros" data-filtros></div>
    <div data-cuerpo class="calendario-cuerpo"></div>
  `;

  el.querySelector('[data-anterior]').addEventListener('click', () => moverCursor(-1));
  el.querySelector('[data-siguiente]').addEventListener('click', () => moverCursor(1));
  el.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
    vista = b.dataset.vista;
    el.querySelectorAll('[data-vista]').forEach((x) => x.classList.toggle('chip--activo', x === b));
    cargarYPintar();
  }));

  const nueva = el.querySelector('[data-nueva]');
  if (nueva) nueva.addEventListener('click', abrirFormularioActividad);
  const refechar = el.querySelector('[data-refechar]');
  if (refechar) refechar.addEventListener('click', abrirFormularioRefechado);

  await cargarYPintar();
}

export function destroy() {
  contenedor = null;
}
