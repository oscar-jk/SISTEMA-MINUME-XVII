// Marcaje de entrada/salida con fecha, hora y lugar en texto. Queda
// pendiente hasta que el supervisor lo apruebe; una vez aprobado es
// inmutable salvo anulación con motivo (lo aplica la base, no esta UI).
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { abrirModal } from '../ui/modal.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { crearTabla } from '../ui/tabla.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import { datosFormulario } from '../ui/formulario.js';
import { nombreCompleto, escapeHtml } from '../utils/formato.js';
import { hoyISO, formatoHora } from '../utils/fechas.js';
import { puedeAsignar } from '../core/permisos.js';

let contenedor = null;
let pestanaActiva = 'mia';

const ESTADO_LABEL = { pendiente: 'Pendiente', aprobado: 'Aprobado', anulado: 'Anulado' };

async function fetchMiHistorial() {
  const { sesion } = getEstado();
  const { data, error } = await supabase
    .from('asistencia')
    .select('*, grupo_trabajo:grupos_trabajo(nombre, espacio:espacios(nombre))')
    .eq('cargo_id', sesion.cargo.id)
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false })
    .limit(30);
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

// El check-in ya no pide un lugar de texto libre — lee el grupo de
// trabajo del cargo (ver 0033_grupos_trabajo.sql y el .select() de
// sesion.js) y muestra tres estados: sin grupo, grupo inactivo, o grupo
// activo con confirmación de un solo clic. Todo sale de `sesion`, sin ida
// y vuelta al servidor para saber cuál mostrar.
function marcar(tipo) {
  const { sesion } = getEstado();
  const grupo = sesion.cargo.grupo_trabajo;
  const titulo = tipo === 'entrada' ? 'Marcar entrada' : 'Marcar salida';
  const div = document.createElement('div');

  if (!grupo) {
    const superior = sesion.cargo.superior;
    const contacto = superior
      ? `Contacta a ${escapeHtml(nombreCompleto(superior.persona))} (${escapeHtml(superior.nombre)})${superior.persona?.telefono ? ` · ${escapeHtml(superior.persona.telefono)}` : ''}.`
      : 'Contacta a tu subsecretario o coordinador.';
    div.innerHTML = `<p class="estado-vacio">Todavía no tienes un grupo de trabajo asignado. ${contacto}</p>`;
    abrirModal({ titulo, contenido: div, ancho: 'angosto' });
    return;
  }

  if (!grupo.activo) {
    div.innerHTML = `<p class="estado-vacio">Tu grupo de trabajo (${escapeHtml(grupo.nombre)}) está inactivo. Contacta a tu subsecretario para que lo reactive o te reasigne.</p>`;
    abrirModal({ titulo, contenido: div, ancho: 'angosto' });
    return;
  }

  div.innerHTML = `
    <div class="formulario">
      <p><strong>${escapeHtml(grupo.nombre)}</strong></p>
      <p class="texto-mudo">${escapeHtml(grupo.espacio?.nombre ?? 'Sin espacio')} · ${formatoHora(grupo.hora_inicio)}–${formatoHora(grupo.hora_fin)}</p>
      <form data-form>
        <button type="submit" class="boton boton--primario boton--ancho">
          ${icono('check', { tamano: 18 })} Confirmar ${tipo === 'entrada' ? 'entrada' : 'salida'}
        </button>
      </form>
    </div>
  `;
  const { cerrar } = abrirModal({ titulo, contenido: div, ancho: 'angosto' });

  div.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('asistencia').insert({
      cargo_id: sesion.cargo.id, tipo, grupo_trabajo_id: sesion.cargo.grupo_trabajo_id,
    });
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso(tipo === 'entrada' ? 'Entrada marcada.' : 'Salida marcada.', 'exito');
    cerrar();
    pintarPestana();
  });
}

async function eliminarPendiente(fila) {
  const { error } = await supabase.from('asistencia').delete().eq('id', fila.id);
  if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
  mostrarAviso('Marcaje eliminado.', 'exito');
  pintarPestana();
}

async function pintarMiAsistencia(el) {
  const filas = await fetchMiHistorial();
  const hoy = hoyISO();
  const hoyAbierta = filas.find((f) => f.fecha === hoy && f.tipo === 'entrada' && f.estado !== 'anulado')
    && !filas.find((f) => f.fecha === hoy && f.tipo === 'salida' && f.estado !== 'anulado');

  el.innerHTML = `
    <div class="tarjeta-tarea__acciones" style="margin-bottom:1rem">
      <button type="button" class="boton boton--primario" data-marcar="${hoyAbierta ? 'salida' : 'entrada'}">
        ${icono('reloj', { tamano: 16 })} Marcar ${hoyAbierta ? 'salida' : 'entrada'}
      </button>
    </div>
    <div data-lista></div>
  `;
  el.querySelector('[data-marcar]').addEventListener('click', (e) => marcar(e.target.closest('[data-marcar]').dataset.marcar));

  const tabla = crearTabla([
    { clave: 'fecha', titulo: 'Fecha' },
    { clave: 'tipo', titulo: 'Tipo', render: (f) => (f.tipo === 'entrada' ? 'Entrada' : 'Salida') },
    { clave: 'hora', titulo: 'Hora', render: (f) => f.hora.slice(0, 5) },
    {
      clave: 'lugar',
      titulo: 'Lugar',
      render: (f) => (f.grupo_trabajo ? `${f.grupo_trabajo.nombre} · ${f.grupo_trabajo.espacio?.nombre ?? '—'}` : (f.lugar || '—')),
    },
    { clave: 'puntual', titulo: 'Puntualidad', render: (f) => (f.puntual === null ? '—' : f.puntual ? 'A tiempo' : `Tarde (${f.minutos_tardanza} min)`) },
    { clave: 'estado', titulo: 'Estado', render: (f) => ESTADO_LABEL[f.estado] },
  ], filas);

  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const fila = filas[i];
    if (!fila || fila.estado !== 'pendiente') return;
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boton boton--fantasma boton--pequeno';
    btn.textContent = 'Eliminar';
    btn.addEventListener('click', () => eliminarPendiente(fila));
    td.appendChild(btn);
    tr.appendChild(td);
  });

  el.querySelector('[data-lista]').replaceChildren(tabla);
}

function abrirModalAnular(fila, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <form class="formulario" data-form>
      <label class="campo"><span>Motivo de la anulación</span><textarea name="motivo_anulacion" rows="3" required></textarea></label>
      <button type="submit" class="boton boton--primario boton--ancho">Anular</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: 'Anular asistencia', contenido: div, ancho: 'angosto' });
  div.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const { error } = await supabase.from('asistencia').update({ estado: 'anulado', motivo_anulacion: datos.motivo_anulacion }).eq('id', fila.id);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Asistencia anulada.', 'exito');
    cerrar();
    alTerminar();
  });
}

async function aprobar(fila, alTerminar) {
  const { error } = await supabase.from('asistencia').update({ estado: 'aprobado' }).eq('id', fila.id);
  if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
  mostrarAviso('Asistencia aprobada.', 'exito');
  alTerminar();
}

async function pintarAprobacion(el) {
  const { data, error } = await supabase
    .from('asistencia')
    .select('*, cargo:cargos!asistencia_cargo_id_fkey(nombre, persona:personas(nombre, apellido)), grupo_trabajo:grupos_trabajo(nombre, espacio:espacios(nombre))')
    .in('estado', ['pendiente', 'aprobado'])
    .order('fecha', { ascending: false })
    .limit(50);
  if (error) { mostrarAviso(mensajeError(error), 'error'); return; }

  const pendientes = data.filter((f) => f.estado === 'pendiente');
  const aprobadas = data.filter((f) => f.estado === 'aprobado');
  const filas = [...pendientes, ...aprobadas];

  if (filas.length === 0) {
    el.innerHTML = '<p class="estado-vacio">Sin marcajes pendientes.</p>';
    return;
  }

  const tabla = crearTabla([
    { clave: 'persona', titulo: 'Persona', render: (f) => nombreCompleto(f.cargo?.persona), ordenarPor: (f) => nombreCompleto(f.cargo?.persona) },
    { clave: 'fecha', titulo: 'Fecha' },
    { clave: 'tipo', titulo: 'Tipo', render: (f) => (f.tipo === 'entrada' ? 'Entrada' : 'Salida') },
    { clave: 'hora', titulo: 'Hora', render: (f) => f.hora.slice(0, 5) },
    {
      clave: 'lugar',
      titulo: 'Lugar',
      render: (f) => (f.grupo_trabajo ? `${f.grupo_trabajo.nombre} · ${f.grupo_trabajo.espacio?.nombre ?? '—'}` : (f.lugar || '—')),
    },
    { clave: 'estado', titulo: 'Estado', render: (f) => ESTADO_LABEL[f.estado] },
  ], filas);

  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const fila = filas[i];
    const td = document.createElement('td');
    td.className = 'tabla__acciones';
    if (fila.estado === 'pendiente') {
      const aprobarBtn = document.createElement('button');
      aprobarBtn.className = 'boton boton--primario boton--pequeno';
      aprobarBtn.innerHTML = icono('check', { tamano: 14 });
      aprobarBtn.addEventListener('click', () => aprobar(fila, () => pintarPestana()));
      td.appendChild(aprobarBtn);
    } else {
      const anularBtn = document.createElement('button');
      anularBtn.className = 'boton boton--secundario boton--pequeno';
      anularBtn.textContent = 'Anular';
      anularBtn.addEventListener('click', () => abrirModalAnular(fila, () => pintarPestana()));
      td.appendChild(anularBtn);
    }
    tr.appendChild(td);
  });

  el.replaceChildren(tabla);
}

async function pintarPestana() {
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  cuerpo.innerHTML = esqueletoTabla();
  if (pestanaActiva === 'mia') await pintarMiAsistencia(cuerpo);
  else await pintarAprobacion(cuerpo);
}

export async function render(el) {
  contenedor = el;
  const { sesion } = getEstado();
  const pestanas = [{ clave: 'mia', titulo: 'Mi asistencia' }];
  if (puedeAsignar(sesion)) pestanas.push({ clave: 'aprobar', titulo: 'Aprobar' });

  el.innerHTML = `
    <div class="vista-cabecera"><h1>Asistencia</h1></div>
    ${pestanas.length > 1 ? `<div class="filtros-chip" data-pestanas>
      ${pestanas.map((p) => `<button type="button" class="chip${p.clave === pestanaActiva ? ' chip--activo' : ''}" data-pestana="${p.clave}">${p.titulo}</button>`).join('')}
    </div>` : ''}
    <div data-cuerpo></div>
  `;

  const nav = el.querySelector('[data-pestanas]');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pestana]');
      if (!btn) return;
      pestanaActiva = btn.dataset.pestana;
      el.querySelectorAll('[data-pestana]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
      pintarPestana();
    });
  }

  await pintarPestana();
}

export function destroy() {
  contenedor = null;
}
