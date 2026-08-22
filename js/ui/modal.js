import { icono } from './icono.js';
import { escapeHtml } from '../utils/formato.js';

// Abre una hoja modal (bottom sheet en móvil, diálogo centrado en escritorio).
// `contenido` puede ser un string HTML o un HTMLElement.
// Devuelve { cerrar, panel } para que el módulo llamador siga interactuando
// (por ejemplo, para actualizar el contenido tras guardar).
export function abrirModal({ titulo, contenido, ancho = 'normal' }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = `modal-panel modal-panel--${ancho}`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `<h2>${escapeHtml(titulo)}</h2><button type="button" class="modal-cerrar" aria-label="Cerrar">${icono('cerrar', { tamano: 20 })}</button>`;

  const cuerpo = document.createElement('div');
  cuerpo.className = 'modal-cuerpo';
  if (typeof contenido === 'string') cuerpo.innerHTML = contenido;
  else cuerpo.appendChild(contenido);

  panel.appendChild(header);
  panel.appendChild(cuerpo);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.body.classList.add('sin-scroll');

  function cerrar() {
    overlay.remove();
    document.body.classList.remove('sin-scroll');
    document.removeEventListener('keydown', alEscape);
  }

  function alEscape(e) {
    if (e.key === 'Escape') cerrar();
  }

  header.querySelector('.modal-cerrar').addEventListener('click', cerrar);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
  document.addEventListener('keydown', alEscape);

  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  return { cerrar, panel: cuerpo };
}
