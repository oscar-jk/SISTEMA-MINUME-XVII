// Catálogos administrables: propiedades, espacios, subsecretarías y fases.
// Nada codificado — toda lista se administra aquí, sin desplegar.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { pintarSubnavAdmin } from '../core/shell.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
import { escapeHtml } from '../utils/formato.js';

let contenedor = null;
let pestanaActiva = 'propiedades';

async function fetchTabla(nombre, orden = 'nombre') {
  const { data, error } = await supabase.from(nombre).select('*').order(orden);
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

async function pintarPropiedades(el) {
  const filas = await fetchTabla('propiedades');
  el.innerHTML = `
    <form class="formulario formulario--en-linea" data-form>
      <input name="nombre" placeholder="Nombre" required />
      <input name="direccion" placeholder="Dirección (opcional)" />
      <button type="submit" class="boton boton--primario">${icono('mas', { tamano: 16 })} Añadir</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('propiedades').insert(datosFormulario(e.target));
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Propiedad añadida.', 'exito');
    await pintarPropiedades(el);
  });
  el.querySelector('[data-lista]').replaceChildren(crearTabla([
    { clave: 'nombre', titulo: 'Nombre' },
    { clave: 'direccion', titulo: 'Dirección' },
    { clave: 'activo', titulo: 'Activa', render: (f) => (f.activo ? 'Sí' : 'No') },
  ], filas));
}

async function pintarEspacios(el) {
  const [propiedades, tipos, estados, filas] = await Promise.all([
    fetchTabla('propiedades'), fetchTabla('tipos_espacio'), fetchTabla('estados_espacio'),
    supabase.from('espacios').select('*, propiedad:propiedades(nombre), tipo:tipos_espacio(nombre), estado:estados_espacio(nombre)').order('nombre').then((r) => r.data || []),
  ]);
  el.innerHTML = `
    <form class="formulario" data-form>
      <div class="formulario__fila">
        <label class="campo"><span>Nombre</span><input name="nombre" required /></label>
        <label class="campo"><span>Piso</span><input name="piso" /></label>
      </div>
      <div class="formulario__fila">
        <label class="campo"><span>Propiedad</span><select name="propiedad_id">${opcionesSelect(propiedades, { valor: 'id', etiqueta: 'nombre', vacio: 'Sin propiedad' })}</select></label>
        <label class="campo"><span>Tipo</span><select name="tipo_id">${opcionesSelect(tipos, { valor: 'id', etiqueta: 'nombre', vacio: 'Sin tipo' })}</select></label>
        <label class="campo"><span>Estado</span><select name="estado_id">${opcionesSelect(estados, { valor: 'id', etiqueta: 'nombre', vacio: 'Sin estado' })}</select></label>
      </div>
      <label class="campo"><span>Capacidad</span><input name="capacidad" type="number" min="0" /></label>
      <button type="submit" class="boton boton--primario boton--ancho">${icono('mas', { tamano: 16 })} Crear espacio</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    if (datos.capacidad) datos.capacidad = Number(datos.capacidad);
    const { error } = await supabase.from('espacios').insert(datos);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Espacio creado.', 'exito');
    await pintarEspacios(el);
  });
  el.querySelector('[data-lista]').replaceChildren(crearTabla([
    { clave: 'nombre', titulo: 'Nombre' },
    { clave: 'propiedad', titulo: 'Propiedad', render: (f) => escapeHtml(f.propiedad?.nombre ?? '—') },
    { clave: 'piso', titulo: 'Piso' },
    { clave: 'tipo', titulo: 'Tipo', render: (f) => escapeHtml(f.tipo?.nombre ?? '—') },
    { clave: 'estado', titulo: 'Estado', render: (f) => escapeHtml(f.estado?.nombre ?? '—') },
    { clave: 'capacidad', titulo: 'Capacidad' },
  ], filas));
}

async function pintarSubsecretarias(el) {
  const filas = await fetchTabla('subsecretarias');
  el.innerHTML = `
    <form class="formulario formulario--en-linea" data-form>
      <input name="nombre" placeholder="Nombre" required />
      <button type="submit" class="boton boton--primario">${icono('mas', { tamano: 16 })} Añadir</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('subsecretarias').insert(datosFormulario(e.target));
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Subsecretaría añadida.', 'exito');
    await pintarSubsecretarias(el);
  });
  el.querySelector('[data-lista]').replaceChildren(crearTabla([
    { clave: 'nombre', titulo: 'Nombre' },
    { clave: 'activa', titulo: 'Activa', render: (f) => (f.activa ? 'Sí' : 'No') },
  ], filas));
}

async function pintarFases(el) {
  const filas = await fetchTabla('fases_actividad', 'orden');
  el.innerHTML = `
    <form class="formulario" data-form>
      <div class="formulario__fila">
        <label class="campo"><span>Código</span><input name="codigo" required /></label>
        <label class="campo"><span>Nombre</span><input name="nombre" required /></label>
        <label class="campo"><span>Orden</span><input name="orden" type="number" required /></label>
      </div>
      <button type="submit" class="boton boton--primario boton--ancho">${icono('mas', { tamano: 16 })} Añadir fase</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    datos.orden = Number(datos.orden);
    const { error } = await supabase.from('fases_actividad').insert(datos);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Fase añadida.', 'exito');
    await pintarFases(el);
  });
  el.querySelector('[data-lista]').replaceChildren(crearTabla([
    { clave: 'orden', titulo: 'Orden' },
    { clave: 'codigo', titulo: 'Código' },
    { clave: 'nombre', titulo: 'Nombre' },
  ], filas));
}

const PESTANAS = {
  propiedades: { titulo: 'Propiedades', pintar: pintarPropiedades },
  espacios: { titulo: 'Espacios', pintar: pintarEspacios },
  subsecretarias: { titulo: 'Subsecretarías', pintar: pintarSubsecretarias },
  fases: { titulo: 'Fases', pintar: pintarFases },
};

async function pintarPestana() {
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  cuerpo.innerHTML = '<p class="estado-vacio">Cargando…</p>';
  await PESTANAS[pestanaActiva].pintar(cuerpo);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Catálogos</h1></div>
    <div data-subnav-admin></div>
    <div class="filtros-chip" data-pestanas>
      ${Object.entries(PESTANAS).map(([clave, p]) => `<button type="button" class="chip${clave === pestanaActiva ? ' chip--activo' : ''}" data-pestana="${clave}">${p.titulo}</button>`).join('')}
    </div>
    <div data-cuerpo></div>
  `;
  pintarSubnavAdmin(el.querySelector('[data-subnav-admin]'), getEstado().sesion);
  el.querySelector('[data-pestanas]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pestana]');
    if (!btn) return;
    pestanaActiva = btn.dataset.pestana;
    el.querySelectorAll('[data-pestana]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
    pintarPestana();
  });
  await pintarPestana();
}

export function destroy() {
  contenedor = null;
}
