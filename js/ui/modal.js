import { icono } from './icono.js';
import { escapeHtml } from '../utils/formato.js';

let contadorId = 0;

function focoables(panel) {
  return Array.from(panel.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((el) => el.offsetParent !== null);
}

// iOS Safari sigue haciendo scroll del fondo con overflow:hidden solo —
// hay que fijar el body con position:fixed y restaurar la posición al
// cerrar, o el "rubber-band" se cuela por debajo del overlay.
function bloquearScroll() {
  const scrollY = window.scrollY;
  document.body.classList.add('sin-scroll');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
  return scrollY;
}

function desbloquearScroll(scrollY) {
  document.body.classList.remove('sin-scroll');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, scrollY);
}

// Abre una hoja modal (bottom sheet en móvil, diálogo centrado en escritorio).
// `contenido` puede ser un string HTML o un HTMLElement.
// Devuelve { cerrar, panel } para que el módulo llamador siga interactuando
// (por ejemplo, para actualizar el contenido tras guardar).
export function abrirModal({ titulo, contenido, ancho = 'normal' }) {
  const idTitulo = `modal-titulo-${++contadorId}`;
  const disparador = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = `modal-panel modal-panel--${ancho}`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', idTitulo);
  panel.tabIndex = -1;

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `<h2 id="${idTitulo}">${escapeHtml(titulo)}</h2><button type="button" class="modal-cerrar" aria-label="Cerrar">${icono('cerrar', { tamano: 20 })}</button>`;

  const cuerpo = document.createElement('div');
  cuerpo.className = 'modal-cuerpo';
  if (typeof contenido === 'string') cuerpo.innerHTML = contenido;
  else cuerpo.appendChild(contenido);

  panel.appendChild(header);
  panel.appendChild(cuerpo);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  const scrollY = bloquearScroll();

  function cerrar() {
    overlay.remove();
    desbloquearScroll(scrollY);
    document.removeEventListener('keydown', alTeclado);
    if (disparador && document.body.contains(disparador)) disparador.focus();
  }

  function alTeclado(e) {
    if (e.key === 'Escape') { cerrar(); return; }
    if (e.key !== 'Tab') return;
    const focables = focoables(panel);
    if (focables.length === 0) { e.preventDefault(); return; }
    const primero = focables[0];
    const ultimo = focables[focables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  header.querySelector('.modal-cerrar').addEventListener('click', cerrar);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
  document.addEventListener('keydown', alTeclado);

  requestAnimationFrame(() => {
    overlay.classList.add('modal-overlay--visible');
    (focoables(panel)[0] || panel).focus();
  });

  return { cerrar, panel: cuerpo };
}
