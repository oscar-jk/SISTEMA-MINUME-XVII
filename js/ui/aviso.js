import { icono } from './icono.js';

let contenedorToasts = null;

function asegurarContenedor() {
  if (contenedorToasts) return contenedorToasts;
  contenedorToasts = document.createElement('div');
  contenedorToasts.className = 'toasts';
  contenedorToasts.setAttribute('role', 'status');
  contenedorToasts.setAttribute('aria-live', 'polite');
  document.body.appendChild(contenedorToasts);
  return contenedorToasts;
}

export function mostrarAviso(mensaje, tipo = 'info', duracionMs = 4000) {
  const cont = asegurarContenedor();
  const toast = document.createElement('div');
  toast.className = `toast toast--${tipo}`;
  const iconoNombre = tipo === 'error' ? 'alerta' : tipo === 'exito' ? 'check-circulo' : 'reloj';
  toast.innerHTML = `${icono(iconoNombre, { tamano: 18 })}<span>${mensaje}</span>`;
  cont.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 250);
  }, duracionMs);
}

export function mensajeError(err) {
  if (!err) return 'Ocurrió un error inesperado.';
  const msg = typeof err === 'string' ? err : err.message || '';
  if (msg.includes('42501') || msg.toLowerCase().includes('permiso') || msg.toLowerCase().includes('permission')) {
    return msg.replace(/^.*?:\s*/, '') || 'No tienes permiso para hacer esto.';
  }
  if (msg.includes('23514')) return msg.replace(/^.*?:\s*/, '') || 'Ese valor no es válido.';
  return msg || 'Ocurrió un error inesperado.';
}
