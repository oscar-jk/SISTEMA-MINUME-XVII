// Árbol recursivo sin límite de profundidad, navegable por división, más
// un directorio plano y buscable con datos de contacto — misma consulta,
// dos lentes. Lo que se ve aquí ya viene filtrado por RLS: cada quien ve
// su propia rama hacia abajo, nunca el organigrama completo salvo que
// tenga alcance para ello (super admin, o SG para las tres divisiones).
import { supabase } from '../core/supabase.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { nombreCompleto, escapeHtml, iniciales } from '../utils/formato.js';
import { crearTabla } from '../ui/tabla.js';
import { esqueletoTabla } from '../ui/esqueleto.js';

let contenedor = null;
let cargos = [];
let divisionActiva = '';
let pestanaActiva = 'arbol';
let busqueda = '';

async function cargar() {
  const { data, error } = await supabase
    .from('cargos')
    .select('id, nombre, tipo, division, subsecretaria:subsecretarias(nombre), comision:comisiones(nombre), superior_id, activo, persona:personas!cargos_persona_id_fkey(nombre, apellido, correo, telefono)')
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
      ${tieneHijos ? `<button type="button" class="organigrama-toggle" aria-expanded="false" aria-label="Expandir rama">${icono('flecha-der', { tamano: 14 })}</button>` : '<span class="organigrama-toggle-espacio"></span>'}
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
    const fijarEstadoToggle = (abierto) => {
      contHijos.hidden = !abierto;
      toggle.classList.toggle('organigrama-toggle--abierto', abierto);
      toggle.setAttribute('aria-expanded', String(abierto));
      toggle.setAttribute('aria-label', abierto ? 'Contraer rama' : 'Expandir rama');
    };
    toggle.addEventListener('click', () => fijarEstadoToggle(contHijos.hidden));
    // Los primeros dos niveles empiezan abiertos; el resto, colapsado.
    fijarEstadoToggle(profundidad < 2);
  }

  return div;
}

function pintarArbol(el) {
  const lista = divisionActiva ? cargos.filter((c) => c.division === divisionActiva || !c.division) : cargos;
  const raices = construirArbol(lista);
  el.innerHTML = '';
  if (raices.length === 0) {
    el.innerHTML = '<p class="estado-vacio">No hay cargos visibles en esta división.</p>';
    return;
  }
  for (const raiz of raices) el.appendChild(nodoHtml(raiz, 0));
}

function coincideBusqueda(cargo, texto) {
  if (!texto) return true;
  const q = texto.toLowerCase();
  return nombreCompleto(cargo.persona).toLowerCase().includes(q)
    || cargo.nombre.toLowerCase().includes(q)
    || (cargo.persona?.correo || '').toLowerCase().includes(q)
    || (cargo.subsecretaria?.nombre || '').toLowerCase().includes(q)
    || (cargo.comision?.nombre || '').toLowerCase().includes(q);
}

function pintarDirectorio(el) {
  const lista = cargos
    .filter((c) => (!divisionActiva || c.division === divisionActiva || !c.division))
    .filter((c) => coincideBusqueda(c, busqueda));

  if (lista.length === 0) {
    el.innerHTML = '<p class="estado-vacio">No hay cargos con estos filtros.</p>';
    return;
  }

  const tabla = crearTabla([
    { clave: 'persona', titulo: 'Nombre', render: (c) => nombreCompleto(c.persona), ordenarPor: (c) => nombreCompleto(c.persona) },
    { clave: 'nombre', titulo: 'Cargo' },
    {
      clave: 'rama',
      titulo: 'División / rama',
      render: (c) => [c.division ? c.division.toUpperCase() : null, c.subsecretaria?.nombre, c.comision?.nombre].filter(Boolean).join(' · ') || '—',
      ordenarPor: (c) => [c.division, c.subsecretaria?.nombre, c.comision?.nombre].filter(Boolean).join(' '),
    },
    {
      clave: 'correo',
      titulo: 'Correo',
      html: true,
      render: (c) => (c.persona?.correo ? `<a href="mailto:${escapeHtml(c.persona.correo)}">${escapeHtml(c.persona.correo)}</a>` : '—'),
      ordenarPor: (c) => c.persona?.correo || '',
    },
    {
      clave: 'telefono',
      titulo: 'Teléfono',
      html: true,
      render: (c) => (c.persona?.telefono ? `<a href="tel:${escapeHtml(c.persona.telefono)}">${escapeHtml(c.persona.telefono)}</a>` : '—'),
      ordenarPor: (c) => c.persona?.telefono || '',
    },
  ], lista);

  el.innerHTML = '';
  el.appendChild(tabla);
}

function pintar() {
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  if (pestanaActiva === 'arbol') pintarArbol(cuerpo);
  else pintarDirectorio(cuerpo);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Organigrama</h1></div>
    <div class="filtros-chip" data-pestanas>
      <button type="button" class="chip chip--activo" data-pestana="arbol">Árbol</button>
      <button type="button" class="chip" data-pestana="directorio">Directorio</button>
    </div>
    <div class="filtros-chip" data-divisiones>
      <button type="button" class="chip chip--activo" data-division="">Todas</button>
      <button type="button" class="chip" data-division="sg">SG</button>
      <button type="button" class="chip" data-division="sga">SGA</button>
      <button type="button" class="chip" data-division="sgl">SGL</button>
    </div>
    <div data-buscar-envoltorio hidden>
      <input type="search" placeholder="Buscar por nombre, cargo, correo, subsecretaría o comisión…" data-buscar class="campo-buscar" />
    </div>
    <div data-cuerpo>${esqueletoTabla(6, 2)}</div>
  `;

  el.querySelector('[data-pestanas]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pestana]');
    if (!btn) return;
    pestanaActiva = btn.dataset.pestana;
    el.querySelectorAll('[data-pestana]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
    el.querySelector('[data-buscar-envoltorio]').hidden = pestanaActiva !== 'directorio';
    pintar();
  });

  el.querySelector('[data-divisiones]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-division]');
    if (!btn) return;
    divisionActiva = btn.dataset.division;
    el.querySelectorAll('[data-division]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
    pintar();
  });

  el.querySelector('[data-buscar]').addEventListener('input', (e) => {
    busqueda = e.target.value.trim();
    pintar();
  });

  cargos = await cargar();
  pintar();
}

export function destroy() {
  contenedor = null;
}
