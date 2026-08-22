// Tabla simple para el panel de administración.
// columnas: [{clave, titulo, render?, html?}] — por defecto toda celda se
// escapa (tanto fila[clave] como lo que devuelva render()). Una columna
// solo se libra del escapado si declara `html: true` explícitamente,
// porque su render() arma markup real a propósito (píldora de estado,
// botón, ícono) — no porque el texto venga de la base de datos.
import { escapeHtml } from '../utils/formato.js';

export function crearTabla(columnas, filas) {
  const encabezado = columnas.map((c) => `<th>${escapeHtml(c.titulo)}</th>`).join('');
  const cuerpo = filas.map((fila) => {
    const celdas = columnas.map((c) => {
      const valor = c.render ? c.render(fila) : (fila[c.clave] ?? '—');
      const contenido = c.html ? valor : escapeHtml(valor);
      return `<td>${contenido}</td>`;
    }).join('');
    return `<tr>${celdas}</tr>`;
  }).join('');

  const envoltorio = document.createElement('div');
  envoltorio.className = 'tabla-envoltorio';
  envoltorio.innerHTML = `<table class="tabla"><thead><tr>${encabezado}</tr></thead><tbody>${cuerpo || `<tr><td colspan="${columnas.length}" class="tabla-vacia">Sin datos.</td></tr>`}</tbody></table>`;
  return envoltorio;
}
