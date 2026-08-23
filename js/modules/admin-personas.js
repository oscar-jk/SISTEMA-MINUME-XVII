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

async function alternarAccesoSalud(cargo, alTerminar) {
  const { error } = await supabase
    .from('cargos')
    .update({ acceso_salud_acreditacion: !cargo.acceso_salud_acreditacion })
    .eq('id', cargo.id);
  if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
  mostrarAviso(cargo.acceso_salud_acreditacion ? 'Acceso a salud retirado.' : 'Acceso a salud otorgado.', 'exito');
  alTerminar();
}

// --- Personas -------------------------------------------------------------

// Crear persona y asignarle cargo son, en RLS, dos escrituras separadas
// (personas.insert / cargos.update|insert) — no hay transacción cruzada
// posible desde el cliente. Si el segundo paso falla, la persona ya
// existe y ahora es visible igual (0022: personas_select_sin_cargo), así
// que el admin puede reintentar la asignación desde aquí mismo sin perder
// el registro ni tener que buscarlo a ciegas.
async function crearPersonaYAsignar(datosPersona, cargoElegido, datosCargoNuevo) {
  const { data: persona, error: errorPersona } = await supabase
    .from('personas').insert(datosPersona).select().single();
  if (errorPersona) throw errorPersona;

  if (cargoElegido === '__nuevo__') {
    const { error } = await supabase.from('cargos').insert({ ...datosCargoNuevo, persona_id: persona.id });
    if (error) throw new Error(`Persona creada, pero el cargo nuevo no se pudo crear: ${mensajeError(error)}`);
  } else if (cargoElegido) {
    const { error } = await supabase.from('cargos').update({ persona_id: persona.id }).eq('id', cargoElegido);
    if (error) throw new Error(`Persona creada, pero no se pudo asignar el cargo: ${mensajeError(error)}`);
  }
  return persona;
}

async function pintarPersonas(el) {
  const [personas, cargosVacantes] = await Promise.all([
    fetchPersonas(),
    fetchCargos().then((cargos) => cargos.filter((c) => !c.persona_id && c.activo)),
  ]);

  el.innerHTML = `
    <form class="formulario" data-form-persona>
      <div class="formulario__fila">
        <label class="campo"><span>Nombre</span><input name="nombre" required /></label>
        <label class="campo"><span>Apellido</span><input name="apellido" required /></label>
      </div>
      <div class="formulario__fila">
        <label class="campo"><span>Documento (opcional)</span><input name="documento" /></label>
        <label class="campo"><span>Correo (opcional)</span><input name="correo" type="email" /></label>
        <label class="campo"><span>Teléfono (opcional)</span><input name="telefono" /></label>
      </div>
      <label class="campo">
        <span>Cargo a asignar</span>
        <select name="cargo_elegido" data-cargo-elegido>
          <option value="">Sin asignar por ahora (queda vacante)</option>
          <option value="__nuevo__">+ Crear un cargo nuevo para esta persona</option>
          ${opcionesSelect(cargosVacantes, { valor: 'id', etiqueta: (c) => `${c.nombre}${c.division ? ` (${c.division.toUpperCase()})` : ''}` })}
        </select>
      </label>
      <div data-cargo-nuevo hidden>
        <div class="formulario__fila">
          <label class="campo"><span>Nombre del cargo</span><input name="cargo_nombre" /></label>
          <label class="campo"><span>Tipo</span><select name="cargo_tipo">${opcionesSelect(TIPOS_CARGO, { valor: 'v', etiqueta: 't' })}</select></label>
        </div>
        <label class="campo"><span>Superior jerárquico</span><select name="cargo_superior_id"></select></label>
      </div>
      <button type="submit" class="boton boton--primario">${icono('mas', { tamano: 16 })} Crear persona</button>
    </form>
    <div data-lista></div>
  `;

  // El selector de superior necesita TODOS los cargos, no solo vacantes —
  // se pinta aparte para no repetir la consulta.
  const cargosTodos = await fetchCargos();
  const selectSuperior = el.querySelector('[name="cargo_superior_id"]');
  selectSuperior.innerHTML = opcionesSelect(cargosTodos, {
    valor: 'id', etiqueta: (c) => `${nombreCompleto(c.persona)} · ${c.nombre}`, vacio: 'Sin superior (raíz)',
  });

  const selectCargo = el.querySelector('[data-cargo-elegido]');
  const bloqueCargoNuevo = el.querySelector('[data-cargo-nuevo]');
  selectCargo.addEventListener('change', () => {
    bloqueCargoNuevo.hidden = selectCargo.value !== '__nuevo__';
  });

  el.querySelector('[data-form-persona]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const datosPersona = { nombre: datos.nombre, apellido: datos.apellido, documento: datos.documento, correo: datos.correo, telefono: datos.telefono };
    const datosCargoNuevo = datos.cargo_elegido === '__nuevo__'
      ? { nombre: datos.cargo_nombre, tipo: datos.cargo_tipo, superior_id: datos.cargo_superior_id, evaluador_id: datos.cargo_superior_id }
      : null;
    try {
      await crearPersonaYAsignar(datosPersona, datos.cargo_elegido, datosCargoNuevo);
      mostrarAviso('Persona creada.', 'exito');
      e.target.reset();
      await pintarPersonas(el);
    } catch (err) {
      mostrarAviso(mensajeError(err), 'error');
      await pintarPersonas(el);
    }
  });

  const tabla = crearTabla([
    { clave: 'nombre', titulo: 'Nombre', render: (p) => nombreCompleto(p) },
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
    { clave: 'persona', titulo: 'Ocupante', html: true, render: (c) => (c.persona ? escapeHtml(nombreCompleto(c.persona)) : '<em>Vacante</em>') },
    { clave: 'activo', titulo: 'Activo', render: (c) => (c.activo ? 'Sí' : 'No') },
    { clave: 'acceso_salud_acreditacion', titulo: 'Acceso a salud', render: (c) => (c.acceso_salud_acreditacion ? 'Sí' : 'No') },
  ], cargos);
  const lista = el.querySelector('[data-lista]');
  lista.replaceChildren(cobertura, tabla);

  const { sesion } = getEstado();
  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const cargo = cargos[i];
    if (!cargo) return;
    const td = document.createElement('td');
    td.className = 'tabla__acciones';

    if (cargo.persona) {
      const sustituirBtn = document.createElement('button');
      sustituirBtn.type = 'button';
      sustituirBtn.className = 'boton boton--fantasma boton--pequeno';
      sustituirBtn.textContent = 'Sustituir';
      sustituirBtn.addEventListener('click', () => abrirModalSustitucion(cargo, personas, () => pintarCargos(el)));
      td.appendChild(sustituirBtn);
    }

    if (sesion.esSuperAdmin) {
      const saludBtn = document.createElement('button');
      saludBtn.type = 'button';
      saludBtn.className = 'boton boton--fantasma boton--pequeno';
      saludBtn.textContent = cargo.acceso_salud_acreditacion ? 'Quitar acceso a salud' : 'Dar acceso a salud';
      saludBtn.addEventListener('click', () => alternarAccesoSalud(cargo, () => pintarCargos(el)));
      td.appendChild(saludBtn);
    }

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
