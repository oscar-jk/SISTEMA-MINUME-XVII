// Catálogos administrables: propiedades, espacios, subsecretarías y fases.
// Nada codificado — toda lista se administra aquí, sin desplegar.
import { supabase } from '../core/supabase.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import { abrirModal } from '../ui/modal.js';
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
    { clave: 'propiedad', titulo: 'Propiedad', render: (f) => f.propiedad?.nombre ?? '—', ordenarPor: (f) => f.propiedad?.nombre || '' },
    { clave: 'piso', titulo: 'Piso' },
    { clave: 'tipo', titulo: 'Tipo', render: (f) => f.tipo?.nombre ?? '—', ordenarPor: (f) => f.tipo?.nombre || '' },
    { clave: 'estado', titulo: 'Estado', render: (f) => f.estado?.nombre ?? '—', ordenarPor: (f) => f.estado?.nombre || '' },
    { clave: 'capacidad', titulo: 'Capacidad' },
  ], filas));
}

// Solo SG y SGL se organizan por subsecretaría — SGA usa comisiones (ver
// pintarComisiones). Las dos filas sembradas antes de 0030 ('Operaciones',
// 'Academica') no tenían división real y se dejaron sin clasificar a
// propósito: aparecen aquí con "—" y no las ve ningún selector de cargo
// filtrado por división.
const DIVISIONES_SUBSECRETARIA = [{ v: 'sg', t: 'SG' }, { v: 'sgl', t: 'SGL' }];

async function pintarSubsecretarias(el) {
  const filas = await fetchTabla('subsecretarias');
  el.innerHTML = `
    <form class="formulario formulario--en-linea" data-form>
      <input name="nombre" placeholder="Nombre" required />
      <select name="division" required>${opcionesSelect(DIVISIONES_SUBSECRETARIA, { valor: 'v', etiqueta: 't' })}</select>
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
    { clave: 'division', titulo: 'División', render: (f) => (f.division || '—').toUpperCase() },
    { clave: 'activa', titulo: 'Activa', render: (f) => (f.activa ? 'Sí' : 'No') },
  ], filas));
}

async function pintarComisiones(el) {
  const filas = await fetchTabla('comisiones');
  el.innerHTML = `
    <form class="formulario formulario--en-linea" data-form>
      <input name="codigo" placeholder="Código (ej. CTD)" required />
      <input name="nombre" placeholder="Nombre" required />
      <button type="submit" class="boton boton--primario">${icono('mas', { tamano: 16 })} Añadir</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('comisiones').insert(datosFormulario(e.target));
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Comisión añadida.', 'exito');
    await pintarComisiones(el);
  });
  el.querySelector('[data-lista]').replaceChildren(crearTabla([
    { clave: 'codigo', titulo: 'Código' },
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

function abrirModalRegional(regional, alGuardar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <form class="formulario" data-form>
      <div class="formulario__fila">
        <label class="campo"><span>Técnico regional</span><input name="tecnico_nombre" value="${escapeHtml(regional.tecnico_nombre || '')}" /></label>
        <label class="campo"><span>Teléfono del técnico</span><input name="tecnico_telefono" value="${escapeHtml(regional.tecnico_telefono || '')}" /></label>
      </div>
      <div class="formulario__fila">
        <label class="campo"><span>Receptor de invitados</span><input name="receptor_nombre" value="${escapeHtml(regional.receptor_nombre || '')}" /></label>
        <label class="campo"><span>Teléfono del receptor</span><input name="receptor_telefono" value="${escapeHtml(regional.receptor_telefono || '')}" /></label>
      </div>
      <button type="submit" class="boton boton--primario boton--ancho">Guardar</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: `Regional ${regional.codigo}`, contenido: div, ancho: 'normal' });
  div.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('regionales').update(datosFormulario(e.target)).eq('id', regional.id);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Regional actualizada.', 'exito');
    cerrar();
    alGuardar();
  });
}

async function pintarRegionales(el) {
  const filas = (await fetchTabla('regionales', 'codigo'))
    .sort((a, b) => (parseInt(a.codigo.slice(1), 10) || 0) - (parseInt(b.codigo.slice(1), 10) || 0));
  el.innerHTML = '<div data-lista></div>';

  const tabla = crearTabla([
    { clave: 'codigo', titulo: 'Regional' },
    { clave: 'tecnico_nombre', titulo: 'Técnico regional', render: (f) => f.tecnico_nombre || '—' },
    { clave: 'tecnico_telefono', titulo: 'Teléfono', render: (f) => f.tecnico_telefono || '—' },
    { clave: 'receptor_nombre', titulo: 'Receptor de invitados', render: (f) => f.receptor_nombre || '—' },
    { clave: 'receptor_telefono', titulo: 'Teléfono', render: (f) => f.receptor_telefono || '—' },
  ], filas);

  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const regional = filas[i];
    if (!regional) return;
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boton boton--fantasma boton--pequeno';
    btn.textContent = 'Editar';
    btn.addEventListener('click', () => abrirModalRegional(regional, () => pintarRegionales(el)));
    td.appendChild(btn);
    tr.appendChild(td);
  });

  el.querySelector('[data-lista]').replaceChildren(tabla);
}

const PESTANAS = {
  propiedades: { titulo: 'Propiedades', pintar: pintarPropiedades },
  espacios: { titulo: 'Espacios', pintar: pintarEspacios },
  subsecretarias: { titulo: 'Subsecretarías', pintar: pintarSubsecretarias },
  comisiones: { titulo: 'Comisiones', pintar: pintarComisiones },
  fases: { titulo: 'Fases', pintar: pintarFases },
  regionales: { titulo: 'Regionales', pintar: pintarRegionales },
};

async function pintarPestana() {
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  cuerpo.innerHTML = esqueletoTabla();
  await PESTANAS[pestanaActiva].pintar(cuerpo);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Catálogos</h1></div>
    <div class="filtros-chip" data-pestanas>
      ${Object.entries(PESTANAS).map(([clave, p]) => `<button type="button" class="chip${clave === pestanaActiva ? ' chip--activo' : ''}" data-pestana="${clave}">${p.titulo}</button>`).join('')}
    </div>
    <div data-cuerpo></div>
  `;
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
