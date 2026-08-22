// Tabla simple para el panel de administración. columnas: [{clave, titulo, render?}]
export function crearTabla(columnas, filas) {
  const encabezado = columnas.map((c) => `<th>${c.titulo}</th>`).join('');
  const cuerpo = filas.map((fila) => {
    const celdas = columnas.map((c) => {
      const valor = c.render ? c.render(fila) : (fila[c.clave] ?? '—');
      return `<td>${valor}</td>`;
    }).join('');
    return `<tr>${celdas}</tr>`;
  }).join('');

  const envoltorio = document.createElement('div');
  envoltorio.className = 'tabla-envoltorio';
  envoltorio.innerHTML = `<table class="tabla"><thead><tr>${encabezado}</tr></thead><tbody>${cuerpo || `<tr><td colspan="${columnas.length}" class="tabla-vacia">Sin datos.</td></tr>`}</tbody></table>`;
  return envoltorio;
}
