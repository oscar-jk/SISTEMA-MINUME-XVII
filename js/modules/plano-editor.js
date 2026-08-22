// Editor visual del plano por propiedad y piso. Arranca en modo vista
// (solo lectura); el modo edición se activa aparte. Todo campo de
// posición tiene su respaldo numérico: en un teléfono, arrastrar con
// precisión no siempre es posible.
import { supabase } from '../core/supabase.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { escapeHtml } from '../utils/formato.js';

const ANCHO_LIENZO = 400;
const ALTO_LIENZO = 360;

export function montarPlano(el, { espacios, editable }) {
  let modoEdicion = false;
  let seleccionado = null;

  function coordenadasValidas(esp) {
    return esp.pos_x != null && esp.pos_y != null && esp.ancho != null && esp.alto != null;
  }

  function pintarLienzo() {
    const lienzo = el.querySelector('[data-lienzo]');
    lienzo.innerHTML = '';
    const conCoordenadas = espacios.filter(coordenadasValidas);

    if (conCoordenadas.length === 0) {
      lienzo.innerHTML = '<p class="estado-vacio">Ningún espacio de este piso tiene coordenadas de plano todavía.</p>';
      return;
    }

    for (const esp of conCoordenadas) {
      const caja = document.createElement(modoEdicion ? 'button' : 'div');
      if (modoEdicion) caja.type = 'button';
      caja.className = `plano-sala${seleccionado?.id === esp.id ? ' plano-sala--activa' : ''}`;
      caja.style.left = `${esp.pos_x}px`;
      caja.style.top = `${esp.pos_y}px`;
      caja.style.width = `${esp.ancho}px`;
      caja.style.height = `${esp.alto}px`;
      caja.innerHTML = `<span>${escapeHtml(esp.nombre)}</span>`;
      caja.addEventListener('click', () => {
        seleccionado = esp;
        pintarLienzo();
        pintarPanel();
      });
      lienzo.appendChild(caja);
    }
  }

  function pintarPanel() {
    const panel = el.querySelector('[data-panel]');
    if (!seleccionado) {
      panel.innerHTML = '<p class="texto-mudo texto-pequeno">Toca un espacio del plano para ver o editar sus datos.</p>';
      return;
    }
    panel.innerHTML = `
      <h3 class="subtitulo" style="margin-top:0">${escapeHtml(seleccionado.nombre)}</h3>
      <p class="texto-mudo texto-pequeno">Capacidad: ${seleccionado.capacidad ?? '—'} · Piso ${escapeHtml(seleccionado.piso ?? '—')}</p>
      ${modoEdicion ? `
        <div class="formulario__fila">
          <label class="campo"><span>Posición X</span><input type="number" data-campo="pos_x" value="${seleccionado.pos_x ?? 0}" /></label>
          <label class="campo"><span>Posición Y</span><input type="number" data-campo="pos_y" value="${seleccionado.pos_y ?? 0}" /></label>
        </div>
        <div class="formulario__fila">
          <label class="campo"><span>Ancho</span><input type="number" data-campo="ancho" value="${seleccionado.ancho ?? 100}" /></label>
          <label class="campo"><span>Alto</span><input type="number" data-campo="alto" value="${seleccionado.alto ?? 80}" /></label>
        </div>
        <button type="button" class="boton boton--primario boton--ancho" data-guardar-pos>Guardar posición</button>
      ` : ''}
    `;

    if (modoEdicion) {
      panel.querySelector('[data-guardar-pos]').addEventListener('click', async () => {
        const valores = {};
        panel.querySelectorAll('[data-campo]').forEach((input) => {
          valores[input.dataset.campo] = Number(input.value);
        });
        const { error } = await supabase.from('espacios').update(valores).eq('id', seleccionado.id);
        if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
        Object.assign(seleccionado, valores);
        mostrarAviso('Posición guardada.', 'exito');
        pintarLienzo();
      });
    }
  }

  el.innerHTML = `
    ${editable ? `
      <div class="filtros-chip">
        <button type="button" class="chip chip--activo" data-modo="vista">Ver</button>
        <button type="button" class="chip" data-modo="editar">Editar</button>
      </div>
    ` : ''}
    <div class="plano-envoltorio">
      <div class="plano-lienzo" data-lienzo style="width:${ANCHO_LIENZO}px;height:${ALTO_LIENZO}px"></div>
      <div class="plano-panel" data-panel></div>
    </div>
  `;

  if (editable) {
    el.querySelectorAll('[data-modo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modoEdicion = btn.dataset.modo === 'editar';
        el.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
        pintarLienzo();
        pintarPanel();
      });
    });
  }

  pintarLienzo();
  pintarPanel();
}
