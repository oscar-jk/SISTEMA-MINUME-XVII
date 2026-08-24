// K.5: sustituye el repintado total a "Cargando…" (que pierde scroll y
// foco en cada acción) por un marcador que aproxima la forma del
// contenido real, para que el layout no salte cuando llegan los datos.
// prefers-reduced-motion ya desactiva la animación de forma global
// (ver css/base.css) — sin necesidad de una rama aparte aquí.

export function esqueletoTabla(filas = 5, columnas = 4) {
  const fila = () => `<div class="esqueleto-fila">${Array.from({ length: columnas }, () => '<span class="esqueleto-celda"></span>').join('')}</div>`;
  return `<div class="esqueleto-tabla">${Array.from({ length: filas }, fila).join('')}</div>`;
}

export function esqueletoLista(items = 3) {
  const tarjeta = () => `
    <div class="esqueleto-tarjeta">
      <span class="esqueleto-linea esqueleto-linea--corta"></span>
      <span class="esqueleto-linea"></span>
      <span class="esqueleto-linea esqueleto-linea--media"></span>
    </div>`;
  return `<div class="esqueleto-lista">${Array.from({ length: items }, tarjeta).join('')}</div>`;
}

export function esqueletoTexto(lineas = 3) {
  return `<div class="esqueleto-texto">${Array.from({ length: lineas }, () => '<span class="esqueleto-linea"></span>').join('')}</div>`;
}
