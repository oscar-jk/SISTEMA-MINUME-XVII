// Tabla simple para el panel de administración.
// columnas: [{clave, titulo, render?, html?, ordenable?, ordenarPor?}] —
// por defecto toda celda se escapa (tanto fila[clave] como lo que
// devuelva render()). Una columna solo se libra del escapado si declara
// `html: true` explícitamente, porque su render() arma markup real a
// propósito (píldora de estado, botón, ícono) — no porque el texto venga
// de la base de datos.
//
// K.4: toda columna con título es ordenable por defecto (clic en el
// encabezado). El orden reordena los <tr> ya creados en el DOM en vez de
// reconstruir la tabla, así que los botones que un módulo llamador añade
// después (tabla.querySelectorAll('tbody tr').forEach(...)) siguen
// funcionando igual tras ordenar — son los mismos nodos, solo cambian de
// posición. El valor de orden es el dato crudo (fila[clave], o
// ordenarPor(fila) si la columna lo declara), nunca el HTML renderizado.
import { escapeHtml } from '../utils/formato.js';

export function crearTabla(columnas, filas) {
  const encabezado = columnas.map((c, i) => {
    const ordenable = c.ordenable !== false && c.titulo !== '' && !!c.clave;
    if (!ordenable) return `<th>${escapeHtml(c.titulo)}</th>`;
    return `<th aria-sort="none"><button type="button" class="tabla__orden" data-col="${i}">${escapeHtml(c.titulo)}<span class="tabla__flecha-orden" aria-hidden="true"></span></button></th>`;
  }).join('');

  const cuerpo = filas.map((fila) => {
    const celdas = columnas.map((c) => {
      const valor = c.render ? c.render(fila) : (fila[c.clave] ?? '—');
      const contenido = c.html ? valor : escapeHtml(valor);
      const orden = c.ordenarPor ? c.ordenarPor(fila) : fila[c.clave];
      const atributoOrden = orden === undefined || orden === null ? '' : ` data-orden="${escapeHtml(String(orden))}"`;
      // data-etiqueta repite el título de columna en cada celda — en móvil
      // la tabla se apila en tarjetas (ver .tabla en css/componentes.css) y
      // esa etiqueta es lo único que identifica cada valor sin encabezado.
      const atributoEtiqueta = c.titulo ? ` data-etiqueta="${escapeHtml(c.titulo)}"` : '';
      return `<td${atributoOrden}${atributoEtiqueta}>${contenido}</td>`;
    }).join('');
    return `<tr>${celdas}</tr>`;
  }).join('');

  const envoltorio = document.createElement('div');
  envoltorio.className = 'tabla-envoltorio';
  envoltorio.innerHTML = `<table class="tabla"><thead><tr>${encabezado}</tr></thead><tbody>${cuerpo || `<tr><td colspan="${columnas.length}" class="tabla-vacia">Sin datos.</td></tr>`}</tbody></table>`;

  if (filas.length > 0) {
    const tabla = envoltorio.querySelector('table');
    envoltorio.querySelectorAll('.tabla__orden').forEach((boton) => {
      boton.addEventListener('click', () => ordenarPorColumna(tabla, boton.closest('th'), Number(boton.dataset.col)));
    });
  }

  return envoltorio;
}

function ordenarPorColumna(tabla, th, columnaIndex) {
  const tbody = tabla.querySelector('tbody');
  const filas = Array.from(tbody.querySelectorAll('tr'));
  if (filas.length === 0 || filas[0].querySelector('.tabla-vacia')) return;

  const siguiente = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
  tabla.querySelectorAll('th[aria-sort]').forEach((otro) => otro.setAttribute('aria-sort', 'none'));
  th.setAttribute('aria-sort', siguiente);

  const factor = siguiente === 'ascending' ? 1 : -1;
  filas.sort((a, b) => {
    const va = a.children[columnaIndex]?.dataset.orden ?? '';
    const vb = b.children[columnaIndex]?.dataset.orden ?? '';
    const na = Number(va);
    const nb = Number(vb);
    if (va !== '' && vb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * factor;
    return va.localeCompare(vb, 'es') * factor;
  });
  filas.forEach((fila) => tbody.appendChild(fila));
}
