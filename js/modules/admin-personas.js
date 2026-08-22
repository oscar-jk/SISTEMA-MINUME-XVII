// Personas y cargos. Gestionable por cualquier jefe de rama (puede_asignar()),
// no solo el super admin — cada quien dentro de su propia rama, según RLS.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { pintarSubnavAdmin } from '../core/shell.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
import { abrirModal } from '../ui/modal.js';
import { nombreCompleto, escapeHtml } from '../utils/formato.js';

let contenedor = null;
let pestanaActiva = 'personas';

const DIVISIONES = [{ v: 'sg', t: 'SG' }, { v: 'sga', t: 'SGA' }, { v: 'sgl', t: 'SGL' }];
const TIPOS_CARGO = [
  { v: 'super_admin', t: 'Super admin' }, { v: 'sg', t: 'SG' }, { v: 'sga', t: 'SGA' },
  { v: 'sgl', t: 'SGL' }, { v: 'subsecretario', t: 'Subsecretario' },
  { v: 'coordinador', t: 'Coordinador' }, { v: 'voluntario', t: 'Voluntario' },
];

async function fetchPersonas() {
  const { data } = await supabase.from('personas').select('*').order('nombre');
  return data || [];
}
async function fetchCargos() {
  const { data } = await supabase
    .from('cargos')
    .select('*, persona:personas(nombre, apellido)')
    .order('nombre');
  return data || [];
}

// --- Personas -------------------------------------------------------------

async function pintarPersonas(el) {
  el.innerHTML = `
    <form class="formulario formulario--en-linea" data-form-persona>
      <input name="nombre" placeholder="Nombre" required />
      <input name="apellido" placeholder="Apellido" required />
      <input name="documento" placeholder="Documento (opcional)" />
      <input name="correo" type="email" placeholder="Correo (opcional)" />
      <input name="telefono" placeholder="Teléfono (opcional)" />
      <button type="submit" class="boton boton--primario">${icono('mas', { tamano: 16 })} Añadir persona</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form-persona]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const { error } = await supabase.from('personas').insert(datos);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Persona añadida.', 'exito');
    e.target.reset();
    await pintarPersonas(el);
  });

  const personas = await fetchPersonas();
  const tabla = crearTabla([
    { clave: 'nombre', titulo: 'Nombre', render: (p) => escapeHtml(nombreCompleto(p)) },
    { clave: 'documento', titulo: 'Documento' },
    { clave: 'correo', titulo: 'Correo' },
    { clave: 'telefono', titulo: 'Teléfono' },
    { clave: 'activa', titulo: 'Activa', render: (p) => (p.activa ? 'Sí' : 'No') },
  ], personas);
  el.querySelector('[data-lista]').replaceChildren(tabla);
}

// --- Cargos -----------------------------------------------------------------

function abrirModalSustitucion(cargo, personas, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <p class="texto-mudo">Sustituye al titular de <strong>${escapeHtml(cargo.nombre)}</strong>. Las tareas abiertas de este cargo quedan automáticamente con el nuevo titular; el historial de ${escapeHtml(nombreCompleto(cargo.persona))} se conserva íntegro.</p>
    <form class="formulario" data-form-sustituir>
      <label class="campo"><span>Persona nueva</span><select name="persona_nueva" required>${opcionesSelect(personas, { valor: 'id', etiqueta: nombreCompleto, vacio: 'Elige una persona' })}</select></label>
      <label class="campo"><span>Motivo</span><textarea name="motivo" rows="3" required></textarea></label>
      <button type="submit" class="boton boton--primario boton--ancho">Sustituir titular</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: 'Sustituir titular', contenido: div, ancho: 'angosto' });
  div.querySelector('[data-form-sustituir]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const { error } = await supabase.rpc('fn_sustituir_titular', {
      p_cargo: cargo.id, p_persona_nueva: datos.persona_nueva, p_motivo: datos.motivo,
    });
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Titular sustituido.', 'exito');
    cerrar();
    alTerminar();
  });
}

async function pintarCargos(el) {
  const [personas, cargos] = await Promise.all([fetchPersonas(), fetchCargos()]);
  el.innerHTML = `
    <form class="formulario" data-form-cargo>
      <div class="formulario__fila">
        <label class="campo"><span>Nombre del cargo</span><input name="nombre" required /></label>
        <label class="campo"><span>Tipo</span><select name="tipo" required>${opcionesSelect(TIPOS_CARGO, { valor: 'v', etiqueta: 't' })}</select></label>
      </div>
      <div class="formulario__fila">
        <label class="campo"><span>División</span><select name="division">${opcionesSelect(DIVISIONES, { valor: 'v', etiqueta: 't', vacio: 'Sin división' })}</select></label>
        <label class="campo"><span>Persona (opcional, deja vacante)</span><select name="persona_id">${opcionesSelect(personas, { valor: 'id', etiqueta: nombreCompleto, vacio: 'Vacante' })}</select></label>
      </div>
      <div class="formulario__fila">
        <label class="campo"><span>Subsecretaría</span><input name="subsecretaria" /></label>
        <label class="campo"><span>Comisión</span><input name="comision" /></label>
      </div>
      <label class="campo"><span>Superior jerárquico</span><select name="superior_id">${opcionesSelect(cargos, { valor: 'id', etiqueta: (c) => `${nombreCompleto(c.persona)} · ${c.nombre}`, vacio: 'Sin superior (raíz)' })}</select></label>
      <button type="submit" class="boton boton--primario boton--ancho">${icono('mas', { tamano: 16 })} Crear cargo</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form-cargo]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    // Por defecto el evaluador es el mismo superior jerárquico.
    datos.evaluador_id = datos.superior_id;
    const { error } = await supabase.from('cargos').insert(datos);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Cargo creado.', 'exito');
    await pintarCargos(el);
  });

  const ocupados = cargos.filter((c) => c.persona_id).length;
  const cobertura = document.createElement('p');
  cobertura.className = 'texto-mudo';
  cobertura.textContent = `Cobertura: ${ocupados}/${cargos.length} cargos ocupados (${cargos.length - ocupados} vacantes).`;

  const tabla = crearTabla([
    { clave: 'nombre', titulo: 'Cargo' },
    { clave: 'tipo', titulo: 'Tipo' },
    { clave: 'division', titulo: 'División', render: (c) => (c.division || '—').toUpperCase() },
    { clave: 'persona', titulo: 'Ocupante', render: (c) => (c.persona ? escapeHtml(nombreCompleto(c.persona)) : '<em>Vacante</em>') },
    { clave: 'activo', titulo: 'Activo', render: (c) => (c.activo ? 'Sí' : 'No') },
  ], cargos);
  const lista = el.querySelector('[data-lista]');
  lista.replaceChildren(cobertura, tabla);

  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const cargo = cargos[i];
    if (!cargo || !cargo.persona) return;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton boton--fantasma boton--pequeno';
    boton.textContent = 'Sustituir';
    boton.addEventListener('click', () => abrirModalSustitucion(cargo, personas, () => pintarCargos(el)));
    const td = document.createElement('td');
    td.appendChild(boton);
    tr.appendChild(td);
  });
}

// --- Contenedor de pestañas -------------------------------------------------

const PESTANAS = {
  personas: { titulo: 'Personas', pintar: pintarPersonas },
  cargos: { titulo: 'Cargos', pintar: pintarCargos },
};

async function pintarPestana() {
  const cuerpo = contenedor.querySelector('[data-cuerpo-admin]');
  cuerpo.innerHTML = '<p class="estado-vacio">Cargando…</p>';
  await PESTANAS[pestanaActiva].pintar(cuerpo);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Personas y cargos</h1></div>
    <div data-subnav-admin></div>
    <div class="filtros-chip" data-pestanas>
      ${Object.entries(PESTANAS).map(([clave, p]) => `<button type="button" class="chip${clave === pestanaActiva ? ' chip--activo' : ''}" data-pestana="${clave}">${p.titulo}</button>`).join('')}
    </div>
    <div data-cuerpo-admin></div>
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
