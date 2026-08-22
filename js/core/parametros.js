// Reemplaza los ':id' del router por hash retirado: cada página de detalle
// lee su parámetro de la query string ("tarea.html?id=...").
export function parametroUrl(nombre) {
  return new URLSearchParams(location.search).get(nombre);
}
