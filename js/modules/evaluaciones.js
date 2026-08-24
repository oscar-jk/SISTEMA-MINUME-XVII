// Evaluación por cortes (Bloque F): activa criterios_evaluacion/
// evaluaciones/es_evaluador_de() — dormidas desde 0001/0008. Un cargo
// califica a los cargos cuyo evaluador_id le apunta a él (no a su cadena
// de supervisión — evaluador_id es una relación aparte, ver 0043), por
// criterio activo, dentro de un corte todavía abierto. El cargo evaluado
// ve su propia nota (confirmado, no es privado entre evaluador y admin).
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { escapeHtml, nombreCompleto } from '../utils/formato.js';
import { esqueletoTexto } from '../ui/esqueleto.js';

let contenedor = null;

async function fetchCargosQueEvaluo(miCargoId) {
  const { data } = await supabase
    .from('cargos')
    .select('id, nombre, persona:personas!cargos_persona_id_fkey(nombre, apellido)')
    .eq('evaluador_id', miCargoId)
    .eq('activo', true)
    .order('nombre');
  return data || [];
}

async function fetchCortesAbiertos() {
  const { data } = await supabase.from('cortes_evaluacion').select('*').eq('cerrado', false).order('fecha_inicio');
  return data || [];
}

async function fetchCriteriosActivos() {
  const { data } = await supabase.from('criterios_evaluacion').select('*').eq('activo', true).order('codigo');
  return data || [];
}

async function fetchExistentes(corteId, cargoId, miCargoId) {
  const { data } = await supabase
    .from('evaluaciones')
    .select('criterio_id, puntuacion, comentario')
    .eq('corte_id', corteId)
    .eq('cargo_id', cargoId)
    .eq('evaluador_id', miCargoId);
  const mapa = {};
  for (const fila of data || []) mapa[fila.criterio_id] = fila;
  return mapa;
}

async function fetchRecibidas(miCargoId) {
  const { data } = await supabase
    .from('evaluaciones')
    .select('puntuacion, corte:cortes_evaluacion(id, nombre), criterio:criterios_evaluacion(nombre, peso)')
    .eq('cargo_id', miCargoId);
  return data || [];
}

async function pintarFormulario(el, sesion) {
  const [cargos, cortes, criterios] = await Promise.all([
    fetchCargosQueEvaluo(sesion.cargo.id), fetchCortesAbiertos(), fetchCriteriosActivos(),
  ]);

  if (cargos.length === 0) {
    el.innerHTML = '<p class="estado-vacio">No evalúas a ningún cargo.</p>';
    return;
  }
  if (cortes.length === 0) {
    el.innerHTML = '<p class="estado-vacio">No hay cortes de evaluación abiertos.</p>';
    return;
  }
  if (criterios.length === 0) {
    el.innerHTML = '<p class="estado-vacio">Todavía no hay criterios de evaluación activos.</p>';
    return;
  }

  el.innerHTML = `
    <div class="formulario__fila">
      <label class="campo"><span>Cargo a evaluar</span><select data-cargo>${opcionesSelect(cargos, { valor: 'id', etiqueta: (c) => `${c.nombre} — ${nombreCompleto(c.persona)}` })}</select></label>
      <label class="campo"><span>Corte</span><select data-corte>${opcionesSelect(cortes, { valor: 'id', etiqueta: 'nombre' })}</select></label>
    </div>
    <form class="formulario" data-form>
      <div data-criterios></div>
      <button type="submit" class="boton boton--primario boton--ancho">${icono('check', { tamano: 16 })} Guardar evaluación</button>
    </form>
  `;

  const selCargo = el.querySelector('[data-cargo]');
  const selCorte = el.querySelector('[data-corte]');

  async function pintarCriteriosForm() {
    const existentes = await fetchExistentes(selCorte.value, selCargo.value, sesion.cargo.id);
    el.querySelector('[data-criterios]').innerHTML = criterios.map((c) => `
      <div class="formulario__fila">
        <label class="campo"><span>${escapeHtml(c.nombre)} (peso ${c.peso})</span>
          <input type="number" min="0" max="10" step="0.5" data-punt="${c.id}" value="${existentes[c.id]?.puntuacion ?? ''}" /></label>
        <label class="campo"><span>Comentario</span><input data-com="${c.id}" value="${escapeHtml(existentes[c.id]?.comentario ?? '')}" /></label>
      </div>
    `).join('');
  }
  selCargo.addEventListener('change', pintarCriteriosForm);
  selCorte.addEventListener('change', pintarCriteriosForm);
  await pintarCriteriosForm();

  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const filas = criterios.map((c) => ({
      corte_id: selCorte.value,
      cargo_id: selCargo.value,
      evaluador_id: sesion.cargo.id,
      criterio_id: c.id,
      puntuacion: el.querySelector(`[data-punt="${c.id}"]`).value || null,
      comentario: el.querySelector(`[data-com="${c.id}"]`).value || null,
    }));
    const { error } = await supabase.from('evaluaciones').upsert(filas, { onConflict: 'corte_id,cargo_id,criterio_id,evaluador_id' });
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Evaluación guardada.', 'exito');
  });
}

function pintarRecibidas(el, filas) {
  if (filas.length === 0) {
    el.innerHTML = '<p class="estado-vacio">Todavía no tienes evaluaciones registradas.</p>';
    return;
  }
  const porCorte = new Map();
  for (const f of filas) {
    const id = f.corte.id;
    if (!porCorte.has(id)) porCorte.set(id, { nombre: f.corte.nombre, items: [] });
    porCorte.get(id).items.push(f);
  }
  el.innerHTML = [...porCorte.values()].map((g) => {
    const sumaPeso = g.items.reduce((acc, f) => acc + Number(f.criterio.peso), 0);
    const promedio = sumaPeso > 0
      ? g.items.reduce((acc, f) => acc + Number(f.puntuacion ?? 0) * Number(f.criterio.peso), 0) / sumaPeso
      : null;
    return `
      <div class="tarjeta-tarea">
        <h3 class="subtitulo" style="margin-top:0">${escapeHtml(g.nombre)}</h3>
        <ul>
          ${g.items.map((f) => `<li>${escapeHtml(f.criterio.nombre)}: ${f.puntuacion ?? '—'}</li>`).join('')}
        </ul>
        ${promedio !== null ? `<p><strong>Promedio ponderado: ${promedio.toFixed(2)}</strong></p>` : ''}
      </div>
    `;
  }).join('');
}

export async function render(el) {
  contenedor = el;
  const { sesion } = getEstado();
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Evaluaciones</h1></div>
    <h2 class="subtitulo">Evaluar</h2>
    <div data-form>${esqueletoTexto()}</div>
    <h2 class="subtitulo">Mis evaluaciones recibidas</h2>
    <div data-recibidas>${esqueletoTexto()}</div>
  `;
  await pintarFormulario(el.querySelector('[data-form]'), sesion);
  pintarRecibidas(el.querySelector('[data-recibidas]'), await fetchRecibidas(sesion.cargo.id));
}

export function destroy() {
  contenedor = null;
}
