// Grupos de trabajo: a qué subsecretaría/comisión pertenecen, dónde y
// cuándo operan, y qué cargos son sus miembros. Los define el
// subsecretario correspondiente (o quien esté por encima), no solo el
// super admin — puede_gestionar_rama() en la base es la autoridad real;
// puedeGestionarRamas() aquí solo evita mostrar un formulario que la RLS
// va a rechazar de todos modos.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import { abrirModal } from '../ui/modal.js';
import { formatoHora } from '../utils/fechas.js';
import { nombreCompleto } from '../utils/formato.js';
import { puedeGestionarRamas } from '../core/permisos.js';

let contenedor = null;

const DIVISIONES = [{ v: 'sg', t: 'SG' }, { v: 'sga', t: 'SGA' }, { v: 'sgl', t: 'SGL' }];

async function fetchGrupos() {
  const { data } = await supabase
    .from('grupos_trabajo')
    .select('id, nombre, subsecretaria_id, comision_id, subsecretaria:subsecretarias(nombre), comision:comisiones(nombre), espacio:espacios(nombre), hora_inicio, hora_fin, activo')
    .order('nombre');
  return data || [];
}
async function fetchEspacios() {
  const { data } = await supabase.from('espacios').select('id, nombre').eq('activo', true).order('nombre');
  return data || [];
}
async function fetchSubsecretarias() {
  const { data } = await supabase.from('subsecretarias').select('id, nombre, division').order('nombre');
  return data || [];
}
async function fetchComisiones() {
  const { data } = await supabase.from('comisiones').select('id, nombre').order('nombre');
  return data || [];
}
async function fetchConteoMiembros() {
  const { data } = await supabase.from('cargos').select('grupo_trabajo_id').not('grupo_trabajo_id', 'is', null);
  const conteo = {};
  for (const fila of data || []) conteo[fila.grupo_trabajo_id] = (conteo[fila.grupo_trabajo_id] || 0) + 1;
  return conteo;
}
async function fetchMiembros(grupoId) {
  const { data } = await supabase
    .from('cargos')
    .select('id, nombre, persona:personas(nombre, apellido)')
    .eq('grupo_trabajo_id', grupoId)
    .order('nombre');
  return data || [];
}
async function fetchCandidatos(grupo) {
  let query = supabase
    .from('cargos')
    .select('id, nombre, persona:personas(nombre, apellido)')
    .eq('activo', true)
    .is('grupo_trabajo_id', null)
    .not('persona_id', 'is', null);
  query = grupo.subsecretaria_id ? query.eq('subsecretaria_id', grupo.subsecretaria_id) : query.eq('comision_id', grupo.comision_id);
  const { data } = await query.order('nombre');
  return data || [];
}

function abrirModalMiembros(grupo, alCerrar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <div data-miembros></div>
    <h3 class="subtitulo">Añadir miembro</h3>
    <div class="formulario formulario--en-linea">
      <select data-select-candidato></select>
      <button type="button" class="boton boton--primario" data-anadir>${icono('mas', { tamano: 16 })} Añadir</button>
    </div>
  `;
  const { cerrar } = abrirModal({ titulo: `Miembros — ${grupo.nombre}`, contenido: div, ancho: 'normal' });

  async function refrescar() {
    const [miembros, candidatos] = await Promise.all([fetchMiembros(grupo.id), fetchCandidatos(grupo)]);

    if (miembros.length === 0) {
      div.querySelector('[data-miembros]').innerHTML = '<p class="estado-vacio">Todavía no tiene miembros.</p>';
    } else {
      const tabla = crearTabla([
        { clave: 'nombre', titulo: 'Persona', render: (c) => nombreCompleto(c.persona), ordenarPor: (c) => nombreCompleto(c.persona) },
        { clave: 'cargo', titulo: 'Cargo', render: (c) => c.nombre },
        { clave: 'acciones', titulo: '' },
      ], miembros);
      tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
        const cargo = miembros[i];
        if (!cargo) return;
        const td = tr.querySelector('td:last-child');
        td.className = 'tabla__acciones';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'boton boton--fantasma boton--pequeno';
        btn.textContent = 'Quitar';
        btn.addEventListener('click', async () => {
          const { error } = await supabase.from('cargos').update({ grupo_trabajo_id: null }).eq('id', cargo.id);
          if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
          await refrescar();
        });
        td.appendChild(btn);
      });
      div.querySelector('[data-miembros]').replaceChildren(tabla);
    }

    const selectCandidato = div.querySelector('[data-select-candidato]');
    selectCandidato.innerHTML = opcionesSelect(candidatos, {
      valor: 'id', etiqueta: (c) => `${nombreCompleto(c.persona)} · ${c.nombre}`, vacio: candidatos.length ? 'Elige un cargo' : 'Sin candidatos disponibles en esta rama',
    });
  }

  div.querySelector('[data-anadir]').addEventListener('click', async () => {
    const id = div.querySelector('[data-select-candidato]').value;
    if (!id) return;
    const { error } = await supabase.from('cargos').update({ grupo_trabajo_id: grupo.id }).eq('id', id);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    await refrescar();
  });

  refrescar();
  return { cerrar };
}

async function pintar(el) {
  const { sesion } = getEstado();
  const [grupos, espacios, subsecretarias, comisiones, conteo] = await Promise.all([
    fetchGrupos(), fetchEspacios(), fetchSubsecretarias(), fetchComisiones(), fetchConteoMiembros(),
  ]);

  const puedeCrear = puedeGestionarRamas(sesion);
  const esSubsecretario = sesion.cargo.tipo === 'subsecretario';

  el.innerHTML = `
    ${puedeCrear ? `
      <form class="formulario" data-form>
        <div class="formulario__fila">
          <label class="campo"><span>Nombre</span><input name="nombre" required /></label>
          <label class="campo"><span>Espacio</span><select name="espacio_id" required>${opcionesSelect(espacios, { valor: 'id', etiqueta: 'nombre', vacio: 'Elige un espacio' })}</select></label>
        </div>
        ${esSubsecretario ? '' : `
        <div class="formulario__fila">
          <label class="campo"><span>División</span><select name="division" data-division>${opcionesSelect(DIVISIONES, { valor: 'v', etiqueta: 't' })}</select></label>
        </div>
        <div class="formulario__fila" data-catalogo-subsecretaria hidden>
          <label class="campo"><span>Subsecretaría</span><select name="subsecretaria_id"></select></label>
        </div>
        <div class="formulario__fila" data-catalogo-comision hidden>
          <label class="campo"><span>Comisión</span><select name="comision_id">${opcionesSelect(comisiones, { valor: 'id', etiqueta: 'nombre', vacio: 'Sin comisión' })}</select></label>
        </div>`}
        <div class="formulario__fila">
          <label class="campo"><span>Hora inicio</span><input name="hora_inicio" type="time" required /></label>
          <label class="campo"><span>Hora fin</span><input name="hora_fin" type="time" required /></label>
        </div>
        <button type="submit" class="boton boton--primario boton--ancho">${icono('mas', { tamano: 16 })} Crear grupo</button>
      </form>
    ` : ''}
    <div data-lista></div>
  `;

  if (puedeCrear && !esSubsecretario) {
    const selectDivision = el.querySelector('[data-division]');
    const bloqueSubsecretaria = el.querySelector('[data-catalogo-subsecretaria]');
    const bloqueComision = el.querySelector('[data-catalogo-comision]');
    const selectSubsecretariaId = el.querySelector('[name="subsecretaria_id"]');
    const selectComisionId = el.querySelector('[name="comision_id"]');

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
    selectDivision.addEventListener('change', actualizarCatalogo);
    actualizarCatalogo();
  }

  if (puedeCrear) {
    el.querySelector('[data-form]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = datosFormulario(e.target);
      const fila = {
        nombre: datos.nombre,
        espacio_id: datos.espacio_id,
        hora_inicio: datos.hora_inicio,
        hora_fin: datos.hora_fin,
        creado_por: sesion.cargo.id,
        subsecretaria_id: esSubsecretario ? sesion.cargo.subsecretaria_id : datos.subsecretaria_id,
        comision_id: esSubsecretario ? sesion.cargo.comision_id : datos.comision_id,
      };
      const { error } = await supabase.from('grupos_trabajo').insert(fila);
      if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
      mostrarAviso('Grupo de trabajo creado.', 'exito');
      await pintar(el);
    });
  }

  if (grupos.length === 0) {
    el.querySelector('[data-lista]').innerHTML = '<p class="estado-vacio">Todavía no hay grupos de trabajo.</p>';
    return;
  }

  const tabla = crearTabla([
    { clave: 'nombre', titulo: 'Grupo' },
    {
      clave: 'rama',
      titulo: 'Subsecretaría / Comisión',
      render: (g) => g.subsecretaria?.nombre || g.comision?.nombre || '—',
      ordenarPor: (g) => g.subsecretaria?.nombre || g.comision?.nombre || '',
    },
    { clave: 'espacio', titulo: 'Espacio', render: (g) => g.espacio?.nombre ?? '—', ordenarPor: (g) => g.espacio?.nombre || '' },
    { clave: 'horario', titulo: 'Horario', render: (g) => `${formatoHora(g.hora_inicio)}–${formatoHora(g.hora_fin)}`, ordenarPor: (g) => g.hora_inicio },
    { clave: 'miembros', titulo: 'Miembros', render: (g) => conteo[g.id] || 0, ordenarPor: (g) => conteo[g.id] || 0 },
    { clave: 'activo', titulo: 'Activo', render: (g) => (g.activo ? 'Sí' : 'No') },
    { clave: 'acciones', titulo: '' },
  ], grupos);

  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const grupo = grupos[i];
    if (!grupo) return;
    const td = tr.querySelector('td:last-child');
    td.className = 'tabla__acciones';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boton boton--fantasma boton--pequeno';
    btn.textContent = 'Miembros';
    btn.addEventListener('click', () => abrirModalMiembros(grupo));
    td.appendChild(btn);
  });

  el.querySelector('[data-lista]').replaceChildren(tabla);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `<div class="vista-cabecera"><h1>Grupos de trabajo</h1></div><div data-cuerpo>${esqueletoTabla()}</div>`;
  await pintar(el.querySelector('[data-cuerpo]'));
}

export function destroy() {
  contenedor = null;
}
