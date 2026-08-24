// Panel de desarrollador: crea persona + cargo + cuenta de acceso en un
// solo flujo guiado para los perfiles de más alto nivel (SG/SGA/SGL y
// subsecretarios) — antes eran tres pantallas desconectadas. Exclusivo de
// super_admin: cargos_insert (RLS) ya exige es_super_admin() para
// cualquier cargo raíz (SG/SGA/SGL, sin superior), y crear-cuenta hace su
// propio chequeo de es_super_admin() del lado del servidor — este panel
// no inventa una regla de acceso nueva, solo junta tres pasos que ya
// existían por separado.
import { supabase } from '../core/supabase.js';
import { llamarFuncion } from '../core/edge-functions.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import { nombreCompleto } from '../utils/formato.js';

let contenedor = null;

const PERFILES = [
  { v: 'sg', t: 'Secretaría General (SG)' },
  { v: 'sga', t: 'Secretaría General Adjunta (SGA)' },
  { v: 'sgl', t: 'Secretaría General Logística (SGL)' },
  { v: 'subsecretario', t: 'Subsecretario' },
];
const DIVISIONES_SUBSECRETARIO = [{ v: 'sg', t: 'SG' }, { v: 'sga', t: 'SGA' }, { v: 'sgl', t: 'SGL' }];

async function fetchSubsecretarias() {
  const { data } = await supabase.from('subsecretarias').select('id, nombre, division').order('nombre');
  return data || [];
}
async function fetchComisiones() {
  const { data } = await supabase.from('comisiones').select('id, nombre').order('nombre');
  return data || [];
}
async function fetchCargosAltoNivel() {
  const { data } = await supabase
    .from('cargos')
    .select('id, nombre, tipo, persona:personas(nombre, apellido)')
    .in('tipo', ['sg', 'sga', 'sgl'])
    .eq('activo', true);
  return data || [];
}
async function fetchPerfilesCreados() {
  const { data } = await supabase
    .from('cargos')
    .select('id, nombre, tipo, division, persona:personas(nombre, apellido)')
    .in('tipo', ['sg', 'sga', 'sgl', 'subsecretario'])
    .order('creado_en', { ascending: false });
  return data || [];
}

// Persona → cargo → cuenta, secuencial y con recuperación explícita en
// cada paso (no hay transacción cruzada posible desde el cliente — mismo
// motivo que crearPersonaYAsignar() en admin-personas.js). Cada mensaje
// de error dice exactamente qué se guardó y dónde terminar a mano.
async function crearPerfilAltoNivel(datosPersona, datosCargo, datosCuenta) {
  const { data: persona, error: errPersona } = await supabase
    .from('personas').insert(datosPersona).select().single();
  if (errPersona) throw errPersona;

  const { data: cargo, error: errCargo } = await supabase
    .from('cargos').insert({ ...datosCargo, persona_id: persona.id }).select().single();
  if (errCargo) {
    throw new Error(`Persona creada, pero el cargo no se pudo crear: ${mensajeError(errCargo)}. La persona queda visible en Personas y cargos para reintentar la asignación.`);
  }

  try {
    await llamarFuncion('crear-cuenta', { ...datosCuenta, persona_id: persona.id });
  } catch (err) {
    throw new Error(`Persona y cargo creados, pero la cuenta de acceso no se pudo crear: ${mensajeError(err)}. Usa Admin → Cuentas para crearla manualmente — la persona ya existe.`);
  }

  return { persona, cargo };
}

function pintarTablaCreados(el, filas) {
  el.replaceChildren(crearTabla([
    { clave: 'nombre', titulo: 'Cargo' },
    { clave: 'tipo', titulo: 'Perfil', render: (c) => (PERFILES.find((p) => p.v === c.tipo)?.t || c.tipo) },
    { clave: 'division', titulo: 'División', render: (c) => (c.division || '—').toUpperCase() },
    { clave: 'persona', titulo: 'Persona', render: (c) => nombreCompleto(c.persona), ordenarPor: (c) => nombreCompleto(c.persona) },
  ], filas));
}

async function pintar(el) {
  const [subsecretarias, comisiones, cargosAltoNivel, creados] = await Promise.all([
    fetchSubsecretarias(), fetchComisiones(), fetchCargosAltoNivel(), fetchPerfilesCreados(),
  ]);

  el.innerHTML = `
    <p class="texto-mudo">Crea persona, cargo y cuenta de acceso en un solo paso — solo para perfiles de secretaría general y subsecretarios. Para coordinadores y voluntarios, usa Personas y cargos.</p>
    <form class="formulario" data-form>
      <h3 class="subtitulo" style="margin-top:0">Persona</h3>
      <div class="formulario__fila">
        <label class="campo"><span>Nombre</span><input name="nombre" required /></label>
        <label class="campo"><span>Apellido</span><input name="apellido" required /></label>
      </div>
      <div class="formulario__fila">
        <label class="campo"><span>Documento (opcional)</span><input name="documento" /></label>
        <label class="campo"><span>Correo de contacto (opcional)</span><input name="correo" type="email" /></label>
        <label class="campo"><span>Teléfono (opcional)</span><input name="telefono" /></label>
      </div>

      <h3 class="subtitulo">Perfil</h3>
      <label class="campo"><span>Tipo de cargo</span><select name="tipo" data-tipo required>${opcionesSelect(PERFILES, { valor: 'v', etiqueta: 't' })}</select></label>

      <div data-bloque-subsecretario hidden>
        <div class="formulario__fila">
          <label class="campo"><span>División</span><select name="division" data-division>${opcionesSelect(DIVISIONES_SUBSECRETARIO, { valor: 'v', etiqueta: 't' })}</select></label>
          <label class="campo"><span>Superior jerárquico</span><select name="superior_id" data-superior required></select></label>
        </div>
        <div class="formulario__fila" data-catalogo-subsecretaria hidden>
          <label class="campo"><span>Subsecretaría</span><select name="subsecretaria_id"></select></label>
        </div>
        <div class="formulario__fila" data-catalogo-comision hidden>
          <label class="campo"><span>Comisión</span><select name="comision_id">${opcionesSelect(comisiones, { valor: 'id', etiqueta: 'nombre', vacio: 'Sin comisión' })}</select></label>
        </div>
      </div>

      <h3 class="subtitulo">Cuenta de acceso</h3>
      <div class="formulario__fila">
        <label class="campo"><span>Correo de acceso</span><input name="correo_acceso" type="email" required /></label>
        <label class="campo"><span>Código de acceso (mínimo 8 caracteres)</span><input name="codigo_acceso" type="text" minlength="8" required /></label>
      </div>

      <button type="submit" class="boton boton--primario boton--ancho">${icono('mas', { tamano: 16 })} Crear perfil completo</button>
    </form>

    <h2 class="subtitulo">Perfiles creados</h2>
    <div data-lista></div>
  `;

  const selectTipo = el.querySelector('[data-tipo]');
  const bloqueSubsecretario = el.querySelector('[data-bloque-subsecretario]');
  const selectDivision = el.querySelector('[data-division]');
  const selectSuperior = el.querySelector('[data-superior]');
  const bloqueSubsecretaria = el.querySelector('[data-catalogo-subsecretaria]');
  const bloqueComision = el.querySelector('[data-catalogo-comision]');
  const selectSubsecretariaId = el.querySelector('[name="subsecretaria_id"]');
  const selectComisionId = el.querySelector('[name="comision_id"]');

  function actualizarSuperior() {
    const division = selectDivision.value;
    const superior = cargosAltoNivel.find((c) => c.tipo === division);
    selectSuperior.innerHTML = superior
      ? opcionesSelect([superior], { valor: 'id', etiqueta: (c) => `${nombreCompleto(c.persona)} · ${c.nombre}` })
      : '<option value="">No hay ningún cargo de esta división todavía — créalo primero</option>';
  }

  function actualizarCatalogo() {
    const division = selectDivision.value;
    bloqueComision.hidden = division !== 'sga';
    bloqueSubsecretaria.hidden = division === 'sga';
    if (bloqueComision.hidden) selectComisionId.value = '';
    if (bloqueSubsecretaria.hidden) {
      selectSubsecretariaId.innerHTML = '';
    } else {
      selectSubsecretariaId.innerHTML = opcionesSelect(
        subsecretarias.filter((s) => s.division === division),
        { valor: 'id', etiqueta: 'nombre', vacio: 'Sin subsecretaría' },
      );
    }
  }

  function actualizarBloqueTipo() {
    bloqueSubsecretario.hidden = selectTipo.value !== 'subsecretario';
    if (!bloqueSubsecretario.hidden) {
      actualizarSuperior();
      actualizarCatalogo();
    }
  }
  selectTipo.addEventListener('change', actualizarBloqueTipo);
  selectDivision.addEventListener('change', () => { actualizarSuperior(); actualizarCatalogo(); });
  actualizarBloqueTipo();

  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const esSubsecretario = datos.tipo === 'subsecretario';

    const datosPersona = { nombre: datos.nombre, apellido: datos.apellido, documento: datos.documento, correo: datos.correo, telefono: datos.telefono };
    const datosCargo = esSubsecretario
      ? {
        nombre: `Subsecretario — ${datos.nombre} ${datos.apellido}`,
        tipo: 'subsecretario',
        division: datos.division,
        superior_id: datos.superior_id,
        evaluador_id: datos.superior_id,
        subsecretaria_id: datos.subsecretaria_id,
        comision_id: datos.comision_id,
      }
      : {
        nombre: `${PERFILES.find((p) => p.v === datos.tipo)?.t}`,
        tipo: datos.tipo,
        division: datos.tipo,
      };
    const datosCuenta = { correo: datos.correo_acceso, codigo_acceso: datos.codigo_acceso };

    if (esSubsecretario && !datos.superior_id) {
      mostrarAviso('No hay ningún cargo de la división elegida todavía — créalo primero.', 'error');
      return;
    }

    try {
      await crearPerfilAltoNivel(datosPersona, datosCargo, datosCuenta);
      mostrarAviso('Perfil creado: persona, cargo y cuenta de acceso listos.', 'exito');
      e.target.reset();
      await pintar(el);
    } catch (err) {
      mostrarAviso(mensajeError(err), 'error');
    }
  });

  pintarTablaCreados(el.querySelector('[data-lista]'), creados);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `<div class="vista-cabecera"><h1>Panel de desarrollador</h1></div><div data-cuerpo>${esqueletoTabla()}</div>`;
  await pintar(el.querySelector('[data-cuerpo]'));
}

export function destroy() {
  contenedor = null;
}
