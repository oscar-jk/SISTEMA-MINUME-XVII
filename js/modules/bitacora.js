// Bitácora de auditoría: legible solo por super admin y SG (lo aplica RLS,
// no esta pantalla). Consulta filtrable por tabla y rango de fechas.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { pintarSubnavAdmin } from '../core/shell.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { crearTabla } from '../ui/tabla.js';
import { escapeHtml } from '../utils/formato.js';

let contenedor = null;

const ACCION_LABEL = {
  sustitucion: 'Sustitución de titular',
  cuenta_reactivada: 'Cuenta reactivada',
  cuenta_desactivada: 'Cuenta desactivada',
  evidencia_purgada: 'Evidencia purgada',
  asistencia_anulada: 'Asistencia anulada',
};

async function cargar(filtros) {
  let query = supabase
    .from('bitacora')
    .select('id, tabla, accion, detalle, creado_en, cargo:cargos(nombre, persona:personas(nombre, apellido))')
    .order('creado_en', { ascending: false })
    .limit(200);

  if (filtros.tabla) query = query.eq('tabla', filtros.tabla);
  if (filtros.desde) query = query.gte('creado_en', filtros.desde);
  if (filtros.hasta) query = query.lte('creado_en', `${filtros.hasta}T23:59:59`);

  const { data, error } = await query;
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return [];
  }
  return data;
}

async function pintar(filtros) {
  const filas = await cargar(filtros);
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  if (filas.length === 0) {
    cuerpo.innerHTML = '<p class="estado-vacio">Sin registros con estos filtros.</p>';
    return;
  }
  const tabla = crearTabla([
    { clave: 'creado_en', titulo: 'Fecha', render: (f) => new Date(f.creado_en).toLocaleString('es-DO') },
    { clave: 'accion', titulo: 'Acción', render: (f) => escapeHtml(ACCION_LABEL[f.accion] || f.accion) },
    { clave: 'tabla', titulo: 'Tabla' },
    { clave: 'quien', titulo: 'Quién', render: (f) => (f.cargo ? escapeHtml(`${f.cargo.persona?.nombre ?? ''} ${f.cargo.persona?.apellido ?? ''}`.trim() || f.cargo.nombre) : '—') },
    { clave: 'detalle', titulo: 'Detalle', render: (f) => (f.detalle ? `<code>${escapeHtml(JSON.stringify(f.detalle))}</code>` : '—') },
  ], filas);
  cuerpo.replaceChildren(tabla);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Bitácora</h1></div>
    <div data-subnav-admin></div>
    <form class="formulario formulario--en-linea" data-filtros>
      <select name="tabla">
        <option value="">Toda tabla</option>
        <option value="cargos">Cargos</option>
        <option value="usuarios">Usuarios</option>
        <option value="evidencias">Evidencia</option>
        <option value="asistencia">Asistencia</option>
      </select>
      <input type="date" name="desde" />
      <input type="date" name="hasta" />
      <button type="submit" class="boton boton--secundario">Filtrar</button>
    </form>
    <div data-cuerpo><p class="estado-vacio">Cargando…</p></div>
  `;
  pintarSubnavAdmin(el.querySelector('[data-subnav-admin]'), getEstado().sesion);

  el.querySelector('[data-filtros]').addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = new FormData(e.target);
    pintar({ tabla: datos.get('tabla'), desde: datos.get('desde'), hasta: datos.get('hasta') });
  });

  await pintar({});
}

export function destroy() {
  contenedor = null;
}
