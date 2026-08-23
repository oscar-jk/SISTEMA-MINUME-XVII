// Verificación en la puerta: cualquier staff con sesión puede consultar
// un código (por cámara del teléfono, que abre esta página con ?c=, o a
// mano si el QR no escanea). No muestra datos de salud — eso vive en
// acreditados_salud, con su propia RLS mucho más estrecha.
import { supabase } from '../core/supabase.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { escapeHtml } from '../utils/formato.js';
import { ROL_ACREDITACION_LABEL, ESTADO_ACREDITADO_LABEL } from '../utils/formato.js';

let contenedor = null;

async function buscar(codigo) {
  if (!codigo) return null;
  const { data, error } = await supabase
    .from('acreditados')
    .select('id, codigo_qr, rol, nombre, apellido, regional:regionales(codigo), estado, foto_path')
    .eq('codigo_qr', codigo.toUpperCase().trim())
    .maybeSingle();
  if (error) { mostrarAviso(mensajeError(error), 'error'); return null; }
  return data;
}

async function fotoUrl(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from('acreditacion').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

async function pintarResultado(el, codigo) {
  el.innerHTML = '<p class="estado-vacio">Buscando…</p>';
  const acreditado = await buscar(codigo);

  if (!acreditado) {
    el.innerHTML = `<p class="estado-vacio">No se encontró ninguna acreditación con el código "${escapeHtml(codigo)}".</p>`;
    return;
  }

  const url = await fotoUrl(acreditado.foto_path);

  el.innerHTML = `
    <div class="verificar-tarjeta">
      ${url ? `<img src="${escapeHtml(url)}" alt="Foto de ${escapeHtml(acreditado.nombre)}" class="verificar-foto" />` : '<div class="verificar-foto verificar-foto--vacia">Sin foto</div>'}
      <h2 style="margin:0.5em 0 0">${escapeHtml(acreditado.nombre)} ${escapeHtml(acreditado.apellido)}</h2>
      <p class="texto-mudo">${escapeHtml(ROL_ACREDITACION_LABEL[acreditado.rol] || acreditado.rol)}${acreditado.regional ? ` · ${escapeHtml(acreditado.regional.codigo)}` : ''}</p>
      <span class="estado estado--${acreditado.estado === 'aprobado' ? 'completada' : acreditado.estado === 'rechazado' ? 'cancelada' : 'no-iniciada'}">${escapeHtml(ESTADO_ACREDITADO_LABEL[acreditado.estado])}</span>
      <p class="texto-mudo texto-pequeno" style="margin-top:1rem">Código: ${escapeHtml(acreditado.codigo_qr)}</p>
    </div>
  `;
}

export async function render(el, codigoInicial) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Verificar acreditación</h1></div>
    <form class="formulario formulario--en-linea" data-form-buscar>
      <input name="codigo" placeholder="Código de la acreditación" value="${escapeHtml(codigoInicial || '')}" autocapitalize="characters" />
      <button type="submit" class="boton boton--primario">Buscar</button>
    </form>
    <div data-resultado style="margin-top:1.5rem"></div>
  `;

  el.querySelector('[data-form-buscar]').addEventListener('submit', (e) => {
    e.preventDefault();
    const codigo = e.target.querySelector('[name="codigo"]').value;
    pintarResultado(el.querySelector('[data-resultado]'), codigo);
  });

  if (codigoInicial) {
    await pintarResultado(el.querySelector('[data-resultado]'), codigoInicial);
  }
}

export function destroy() {
  contenedor = null;
}
