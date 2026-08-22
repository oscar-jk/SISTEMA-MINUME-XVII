// Helpers mínimos para formularios: serializar a objeto y armar <select>.
import { escapeHtml } from '../utils/formato.js';

export function datosFormulario(form) {
  const datos = new FormData(form);
  const obj = {};
  for (const [clave, valor] of datos.entries()) {
    obj[clave] = valor === '' ? null : valor;
  }
  return obj;
}

export function opcionesSelect(items, { valor, etiqueta, seleccionado = null, vacio = null }) {
  const partes = [];
  if (vacio !== null) partes.push(`<option value="">${escapeHtml(vacio)}</option>`);
  for (const item of items) {
    const v = typeof valor === 'function' ? valor(item) : item[valor];
    const t = typeof etiqueta === 'function' ? etiqueta(item) : item[etiqueta];
    const sel = String(v) === String(seleccionado) ? 'selected' : '';
    partes.push(`<option value="${escapeHtml(v)}" ${sel}>${escapeHtml(t)}</option>`);
  }
  return partes.join('');
}
