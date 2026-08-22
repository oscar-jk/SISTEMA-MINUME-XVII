// Único punto de definición de los SVG en línea. Trazo simple, grosor 1.5,
// sin relleno. Sustituir el set oficial es editar este archivo y nada más.

const TRAZOS = {
  calendario: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  alerta: '<path d="M10.3 3.6 2.6 17.4a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4L13.7 3.6a1.6 1.6 0 0 0-2.8 0Z"/><path d="M12 9.5v4.2M12 16.7h.01"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  'check-circulo': '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5 10.5 15.5 16.5 8.5"/>',
  cerrar: '<path d="M5 5 19 19M19 5 5 19"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  usuario: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  filtro: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  'flecha-izq': '<path d="M15 5 8 12l7 7"/>',
  'flecha-der': '<path d="M9 5l7 7-7 7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  estrella: '<path d="M12 3.5l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 15.9l-5 2.8 1.2-5.6-4.2-3.8 5.6-.6L12 3.5Z"/>',
  cadena: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5l1.5-1.5a3.5 3.5 0 0 1 5 5L16 11.5M13 17.5 11.5 19a3.5 3.5 0 0 1-5-5L8 12.5"/>',
  salir: '<path d="M9 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3"/><path d="M15 16.5l4.5-4.5-4.5-4.5M19 12H9"/>',
  bandeja: '<path d="M3 12.5V6.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 6.5v6"/><path d="M3 12.5h5.5l1.5 2.5h4l1.5-2.5H21v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-5Z"/>',
  admin: '<path d="M10.5 3.5h3l.6 2.4a7 7 0 0 1 1.9 1.1l2.4-.8 1.5 2.6-1.8 1.7a7 7 0 0 1 0 2.2l1.8 1.7-1.5 2.6-2.4-.8a7 7 0 0 1-1.9 1.1l-.6 2.4h-3l-.6-2.4a7 7 0 0 1-1.9-1.1l-2.4.8-1.5-2.6 1.8-1.7a7 7 0 0 1 0-2.2L4.1 8.8l1.5-2.6 2.4.8a7 7 0 0 1 1.9-1.1l.6-2.4Z"/><circle cx="12" cy="12" r="2.6"/>',
  reintentar: '<path d="M4 4v5h5"/><path d="M20 20v-5h-5"/><path d="M5.5 15A7.5 7.5 0 0 0 19 9M18.5 9A7.5 7.5 0 0 0 5 15"/>',
  adjunto: '<path d="M15.5 6.5 8 14a2.5 2.5 0 0 0 3.5 3.5l7-7a4 4 0 0 0-5.6-5.6l-7 7A5.5 5.5 0 0 0 13.7 19.7"/>',
};

export function icono(nombre, { tamano = 20, clase = '' } = {}) {
  const trazo = TRAZOS[nombre] || TRAZOS.alerta;
  return `<svg class="icono ${clase}" width="${tamano}" height="${tamano}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazo}</svg>`;
}
