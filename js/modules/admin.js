import { supabase } from '../core/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
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
async function fetchPersonasSinCuenta() {
  const { data } = await supabase
    .from('personas')
    .select('id, nombre, apellido, correo, usuarios(id)');
  return (data || []).filter((p) => !p.usuarios || p.usuarios.length === 0);
}

// --- Personas -------------------------------------------------------------

async function pintarPersonas(el) {
  el.innerHTML = `
    <form class="formulario formulario--en-linea" data-form-persona>
      <input name="nombre" placeholder="Nombre" required />
      <input name="apellido" placeholder="Apellido" required />
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
    { clave: 'correo', titulo: 'Correo' },
    { clave: 'telefono', titulo: 'Teléfono' },
    { clave: 'activa', titulo: 'Activa', render: (p) => (p.activa ? 'Sí' : 'No') },
  ], personas);
  el.querySelector('[data-lista]').replaceChildren(tabla);
}

// --- Cargos -----------------------------------------------------------------

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

  const tabla = crearTabla([
    { clave: 'nombre', titulo: 'Cargo' },
    { clave: 'tipo', titulo: 'Tipo' },
    { clave: 'division', titulo: 'División', render: (c) => (c.division || '—').toUpperCase() },
    { clave: 'persona', titulo: 'Ocupante', render: (c) => (c.persona ? escapeHtml(nombreCompleto(c.persona)) : '<em>Vacante</em>') },
    { clave: 'activo', titulo: 'Activo', render: (c) => (c.activo ? 'Sí' : 'No') },
  ], cargos);
  el.querySelector('[data-lista]').replaceChildren(tabla);
}

// --- Cuentas ------------------------------------------------------------

async function pintarCuentas(el) {
  const personas = await fetchPersonasSinCuenta();
  el.innerHTML = `
    <p class="texto-mudo">Sin autoservicio de registro: las cuentas se crean aquí con correo y código de acceso.</p>
    <form class="formulario" data-form-cuenta>
      <label class="campo">
        <span>Persona</span>
        <select name="persona_id" required>${opcionesSelect(personas, { valor: 'id', etiqueta: nombreCompleto, vacio: 'Elige una persona sin cuenta' })}</select>
      </label>
      <label class="campo"><span>Correo de acceso</span><input name="correo" type="email" required /></label>
      <label class="campo"><span>Código de acceso (mínimo 8 caracteres)</span><input name="codigo_acceso" type="text" minlength="8" required /></label>
      <button type="submit" class="boton boton--primario boton--ancho">Crear cuenta</button>
    </form>
  `;
  el.querySelector('[data-form-cuenta]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/crear-cuenta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(datos),
    });
    const resultado = await resp.json();
    if (!resp.ok) {
      mostrarAviso(resultado.error || 'No se pudo crear la cuenta.', 'error');
      return;
    }
    mostrarAviso('Cuenta creada. Comparte el correo y el código de acceso por un canal seguro.', 'exito');
    await pintarCuentas(el);
  });
}

// --- Re-fechado -----------------------------------------------------------

function pintarRefechado(el) {
  el.innerHTML = `
    <p class="texto-mudo">La fecha del evento (3–10 de noviembre de 2026) es tentativa. Esto mueve la fecha de cada actividad del rango y, con ella, la fecha límite de sus tareas.</p>
    <form class="formulario" data-form-refechar>
      <div class="formulario__fila">
        <label class="campo"><span>Desde</span><input name="desde" type="date" required /></label>
        <label class="campo"><span>Hasta</span><input name="hasta" type="date" required /></label>
      </div>
      <label class="campo"><span>Días a mover (negativo para adelantar)</span><input name="dias" type="number" required value="1" /></label>
      <button type="submit" class="boton boton--primario boton--ancho">Re-fechar rango</button>
    </form>
  `;
  el.querySelector('[data-form-refechar]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const { data, error } = await supabase.rpc('fn_refechar_rango', {
      p_desde: datos.desde, p_hasta: datos.hasta, p_dias: Number(datos.dias),
    });
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso(`Listo. ${data} actividades quedaron en el nuevo rango de fechas.`, 'exito');
  });
}

// --- Contenedor de pestañas -------------------------------------------------

const PESTANAS = {
  personas: { titulo: 'Personas', pintar: pintarPersonas },
  cargos: { titulo: 'Cargos', pintar: pintarCargos },
  cuentas: { titulo: 'Cuentas', pintar: pintarCuentas },
  refechado: { titulo: 'Re-fechado en bloque', pintar: pintarRefechado },
};

async function pintarPestana() {
  const cuerpo = contenedor.querySelector('[data-cuerpo-admin]');
  cuerpo.innerHTML = '<p class="estado-vacio">Cargando…</p>';
  await PESTANAS[pestanaActiva].pintar(cuerpo);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Administración</h1></div>
    <div class="filtros-chip" data-pestanas>
      ${Object.entries(PESTANAS).map(([clave, p]) => `<button type="button" class="chip${clave === pestanaActiva ? ' chip--activo' : ''}" data-pestana="${clave}">${p.titulo}</button>`).join('')}
    </div>
    <div data-cuerpo-admin></div>
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
