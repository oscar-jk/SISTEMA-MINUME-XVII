// Croquis público (Bloque H): vista de solo lectura del plano de
// espacios, sin sesión — espacios_select_publico (0045) abre la tabla a
// anon, aditivo a la política de authenticated que ya existía (mismo
// molde que regionales_lectura_publica, 0029). Reutiliza montarPlano()
// de plano-editor.js tal cual, con editable: false — ese camino ya es
// 100% funcional hoy (lo usa espacios.js para quien no puede_asignar()),
// cero cambios ahí.
import { supabase } from '../core/supabase.js';
import { montarPlano } from './plano-editor.js';
import { esqueletoTexto } from '../ui/esqueleto.js';
import { escapeHtml } from '../utils/formato.js';

let pisoActivo = '';

// Sin tipo/estado: plano-editor.js no los usa, así que el fetch público
// no necesita exponerlos a anon.
async function fetchEspaciosPublico() {
  const { data, error } = await supabase
    .from('espacios')
    .select('id, nombre, piso, capacidad, pos_x, pos_y, ancho, alto')
    .eq('activo', true)
    .order('nombre');
  if (error) return [];
  return data;
}

export async function render(el) {
  el.innerHTML = esqueletoTexto();
  const espacios = await fetchEspaciosPublico();
  const pisos = [...new Set(espacios.map((e) => e.piso).filter(Boolean))].sort();

  el.innerHTML = `
    <div class="filtros-chip" data-pisos>
      <button type="button" class="chip chip--activo" data-piso="">Todos los pisos</button>
      ${pisos.map((p) => `<button type="button" class="chip" data-piso="${escapeHtml(p)}">Piso ${escapeHtml(p)}</button>`).join('')}
    </div>
    <div data-lienzo-envoltorio></div>
  `;

  el.querySelector('[data-pisos]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-piso]');
    if (!btn) return;
    pisoActivo = btn.dataset.piso;
    el.querySelectorAll('[data-piso]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
    renderizarLienzo();
  });

  function renderizarLienzo() {
    const filtrados = pisoActivo ? espacios.filter((e) => e.piso === pisoActivo) : espacios;
    montarPlano(el.querySelector('[data-lienzo-envoltorio]'), { espacios: filtrados, editable: false });
  }
  renderizarLienzo();
}
