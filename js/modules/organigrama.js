// Árbol recursivo sin límite de profundidad, navegable por división. Lo
// que se ve aquí ya viene filtrado por RLS: cada quien ve su propia rama
// hacia abajo, nunca el organigrama completo salvo que tenga alcance para
// ello (super admin, o SG para las tres divisiones).
import { supabase } from '../core/supabase.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { nombreCompleto, escapeHtml, iniciales } from '../utils/formato.js';

let contenedor = null;
let cargos = [];
let divisionActiva = '';

async function cargar() {
  const { data, error } = await supabase
    .from('cargos')
    .select('id, nombre, tipo, division, superior_id, activo, persona:personas(nombre, apellido)')
    .eq('activo', true)
    .order('nombre');
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return [];
  }
  return data;
}

function construirArbol(lista) {
  const porId = new Map(lista.map((c) => [c.id, { ...c, hijos: [] }]));
  const raices = [];
  for (const cargo of porId.values()) {
    if (cargo.superior_id && porId.has(cargo.superior_id)) {
      porId.get(cargo.superior_id).hijos.push(cargo);
    } else {
      raices.push(cargo);
    }
  }
  return raices;
}

function nodoHtml(cargo, profundidad) {
  const div = document.createElement('div');
  div.className = 'organigrama-nodo';
  div.style.setProperty('--profundidad', profundidad);

  const tieneHijos = cargo.hijos.length > 0;
  div.innerHTML = `
    <div class="organigrama-tarjeta">
      ${tieneHijos ? `<button type="button" class="organigrama-toggle" aria-label="Expandir">${icono('flecha-der', { tamano: 14 })}</button>` : '<span class="organigrama-toggle-espacio"></span>'}
      <span class="organigrama-avatar">${escapeHtml(iniciales(cargo.persona?.nombre, cargo.persona?.apellido))}</span>
      <span class="organigrama-info">
        <strong>${escapeHtml(nombreCompleto(cargo.persona))}</strong>
        <span class="texto-mudo texto-pequeno">${escapeHtml(cargo.nombre)}${cargo.division ? ` · ${cargo.division.toUpperCase()}` : ''}</span>
      </span>
    </div>
    ${tieneHijos ? `<div class="organigrama-hijos" hidden></div>` : ''}
  `;

  if (tieneHijos) {
    const contHijos = div.querySelector('.organigrama-hijos');
    for (const hijo of cargo.hijos) contHijos.appendChild(nodoHtml(hijo, profundidad + 1));

    const toggle = div.querySelector('.organigrama-toggle');
    toggle.addEventListener('click', () => {
      const abierto = !contHijos.hidden;
      contHijos.hidden = abierto;
      toggle.classList.toggle('organigrama-toggle--abierto', !abierto);
    });
    // Los primeros dos niveles empiezan abiertos; el resto, colapsado.
    if (profundidad < 2) {
      contHijos.hidden = false;
      toggle.classList.add('organigrama-toggle--abierto');
    }
  }

  return div;
}

function pintar() {
  const lista = divisionActiva ? cargos.filter((c) => c.division === divisionActiva || !c.division) : cargos;
  const raices = construirArbol(lista);
  const cuerpo = contenedor.querySelector('[data-arbol]');
  cuerpo.innerHTML = '';
  if (raices.length === 0) {
    cuerpo.innerHTML = '<p class="estado-vacio">No hay cargos visibles en esta división.</p>';
    return;
  }
  for (const raiz of raices) cuerpo.appendChild(nodoHtml(raiz, 0));
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Organigrama</h1></div>
    <div class="filtros-chip" data-divisiones>
      <button type="button" class="chip chip--activo" data-division="">Todas</button>
      <button type="button" class="chip" data-division="sg">SG</button>
      <button type="button" class="chip" data-division="sga">SGA</button>
      <button type="button" class="chip" data-division="sgl">SGL</button>
    </div>
    <div data-arbol><p class="estado-vacio">Cargando…</p></div>
  `;

  el.querySelector('[data-divisiones]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-division]');
    if (!btn) return;
    divisionActiva = btn.dataset.division;
    el.querySelectorAll('[data-division]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
    pintar();
  });

  cargos = await cargar();
  pintar();
}

export function destroy() {
  contenedor = null;
}
