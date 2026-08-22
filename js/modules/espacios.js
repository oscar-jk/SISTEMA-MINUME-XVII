// Espacios, propiedades y plano. Pestañas: Plano (editor visual) y
// Asignaciones (personal por espacio y franja horaria).
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
import { nombreCompleto, escapeHtml } from '../utils/formato.js';
import { hoyISO } from '../utils/fechas.js';
import { montarPlano } from './plano-editor.js';
import { puedeAsignar } from '../core/permisos.js';

let contenedor = null;
let pestanaActiva = 'plano';
let pisoActivo = '';

async function fetchEspacios() {
  const { data, error } = await supabase
    .from('espacios')
    .select('id, nombre, piso, capacidad, pos_x, pos_y, ancho, alto, tipo:tipos_espacio(nombre), estado:estados_espacio(nombre)')
    .eq('activo', true)
    .order('nombre');
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

async function fetchCargosVisibles() {
  const { data } = await supabase
    .from('cargos')
    .select('id, nombre, persona:personas(nombre, apellido)')
    .eq('activo', true)
    .order('nombre');
  return (data || []).filter((c) => c.persona);
}

async function fetchAsignaciones(fecha) {
  let query = supabase
    .from('asignaciones_espacio')
    .select('id, fecha, hora_inicio, hora_fin, espacio:espacios(id, nombre), cargo:cargos!asignaciones_espacio_cargo_id_fkey(id, nombre, persona:personas(nombre, apellido))')
    .order('fecha', { ascending: false })
    .order('hora_inicio');
  if (fecha) query = query.eq('fecha', fecha);
  const { data, error } = await query.limit(100);
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

async function pintarPlano(el, espacios) {
  const pisos = [...new Set(espacios.map((e) => e.piso).filter(Boolean))].sort();
  el.innerHTML = `
    <div class="filtros-chip" data-pisos>
      <button type="button" class="chip${pisoActivo === '' ? ' chip--activo' : ''}" data-piso="">Todos los pisos</button>
      ${pisos.map((p) => `<button type="button" class="chip${pisoActivo === p ? ' chip--activo' : ''}" data-piso="${escapeHtml(p)}">Piso ${escapeHtml(p)}</button>`).join('')}
    </div>
    <div data-lienzo-envoltorio></div>
  `;
  el.querySelector('[data-pisos]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-piso]');
    if (!btn) return;
    pisoActivo = btn.dataset.piso;
    el.querySelectorAll('[data-piso]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
    renderizarLienzo();
  });

  function renderizarLienzo() {
    const filtrados = pisoActivo ? espacios.filter((e) => e.piso === pisoActivo) : espacios;
    const { sesion } = getEstado();
    montarPlano(el.querySelector('[data-lienzo-envoltorio]'), { espacios: filtrados, editable: puedeAsignar(sesion) });
  }
  renderizarLienzo();
}

async function generarTarea(asignacion) {
  const { sesion } = getEstado();
  const { error } = await supabase.from('tareas').insert({
    titulo: `Cubrir ${asignacion.espacio?.nombre} (${asignacion.hora_inicio}–${asignacion.hora_fin})`,
    descripcion: 'Tarea generada desde una asignación de espacio.',
    responsable_cargo_id: asignacion.cargo?.id,
    supervisor_cargo_id: sesion.cargo.id,
    fecha_limite: asignacion.fecha,
    estado: 'no_iniciada',
    creada_por: sesion.cargo.id,
  });
  if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
  mostrarAviso('Tarea generada.', 'exito');
}

async function pintarAsignaciones(el, espacios) {
  const { sesion } = getEstado();
  const hoy = hoyISO();
  const cargos = puedeAsignar(sesion) ? await fetchCargosVisibles() : [];
  const asignaciones = await fetchAsignaciones(hoy);

  const cubiertos = new Set(asignaciones.map((a) => a.espacio?.id));
  const descubiertos = espacios.filter((e) => !cubiertos.has(e.id));

  el.innerHTML = `
    <p class="texto-mudo">Cobertura de hoy: ${cubiertos.size}/${espacios.length} espacios cubiertos${descubiertos.length ? ` — sin cubrir: ${descubiertos.map((e) => escapeHtml(e.nombre)).join(', ')}` : ''}.</p>
    ${puedeAsignar(sesion) ? `
      <form class="formulario" data-form-asignacion>
        <div class="formulario__fila">
          <label class="campo"><span>Espacio</span><select name="espacio_id" required>${opcionesSelect(espacios, { valor: 'id', etiqueta: 'nombre', vacio: 'Elige un espacio' })}</select></label>
          <label class="campo"><span>Persona</span><select name="cargo_id" required>${opcionesSelect(cargos, { valor: 'id', etiqueta: (c) => `${nombreCompleto(c.persona)} · ${c.nombre}`, vacio: 'Elige una persona' })}</select></label>
        </div>
        <div class="formulario__fila">
          <label class="campo"><span>Fecha</span><input name="fecha" type="date" required value="${hoy}" /></label>
          <label class="campo"><span>Hora inicio</span><input name="hora_inicio" type="time" required /></label>
          <label class="campo"><span>Hora fin</span><input name="hora_fin" type="time" required /></label>
        </div>
        <button type="submit" class="boton boton--primario boton--ancho">${icono('mas', { tamano: 16 })} Asignar</button>
      </form>
    ` : ''}
    <div data-tabla></div>
  `;

  const form = el.querySelector('[data-form-asignacion]');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = datosFormulario(e.target);
      const { error } = await supabase.from('asignaciones_espacio').insert({ ...datos, creado_por: sesion.cargo.id });
      if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
      mostrarAviso('Espacio asignado.', 'exito');
      pintarPestana();
    });
  }

  const tabla = crearTabla([
    { clave: 'espacio', titulo: 'Espacio', render: (a) => a.espacio?.nombre ?? '—' },
    { clave: 'persona', titulo: 'Persona', render: (a) => nombreCompleto(a.cargo?.persona) },
    { clave: 'fecha', titulo: 'Fecha' },
    { clave: 'horario', titulo: 'Horario', render: (a) => `${a.hora_inicio}–${a.hora_fin}` },
  ], asignaciones);

  if (puedeAsignar(sesion)) {
    tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
      const asignacion = asignaciones[i];
      if (!asignacion) return;
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'boton boton--fantasma boton--pequeno';
      btn.textContent = 'Generar tarea';
      btn.addEventListener('click', () => generarTarea(asignacion));
      td.appendChild(btn);
      tr.appendChild(td);
    });
  }

  el.querySelector('[data-tabla]').replaceChildren(tabla);
}

async function pintarPestana() {
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  cuerpo.innerHTML = '<p class="estado-vacio">Cargando…</p>';
  const espacios = await fetchEspacios();
  if (pestanaActiva === 'plano') await pintarPlano(cuerpo, espacios);
  else await pintarAsignaciones(cuerpo, espacios);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Espacios</h1></div>
    <div class="filtros-chip" data-pestanas>
      <button type="button" class="chip chip--activo" data-pestana="plano">Plano</button>
      <button type="button" class="chip" data-pestana="asignaciones">Asignaciones</button>
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
