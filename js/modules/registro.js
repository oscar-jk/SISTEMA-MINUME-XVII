// Formulario público de acreditación — sin sesión, sin RLS de escritura:
// todo pasa por la Edge Function registrar-acreditado (service_role).
// Los campos con * son los únicos que el servidor exige de verdad; el
// resto es mejor esfuerzo, igual que en el formulario que se integró.
import { supabase } from '../core/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { escapeHtml } from '../utils/formato.js';
import { comprimirImagen } from '../utils/imagen.js';
import { qrcode } from '../vendor/qrcode-generator.js';
import { ROL_ACREDITACION_LABEL } from '../utils/formato.js';

const ROLES = Object.entries(ROL_ACREDITACION_LABEL).map(([v, t]) => ({ v, t }));

const DIAGNOSTICOS = ['Ninguna', 'Asma', 'Diabetes', 'Hipertensión', 'Epilepsia', 'Otra'];

let contenedor = null;
let regionales = [];

async function cargarRegionales() {
  const { data } = await supabase
    .from('regionales')
    .select('codigo, tecnico_nombre, tecnico_telefono, receptor_nombre, receptor_telefono')
    .eq('activa', true);
  // Orden numérico (R1, R2… R18) — el orden alfabético del propio SQL
  // pone R10 antes que R2.
  return (data || []).sort((a, b) => (parseInt(a.codigo.slice(1), 10) || 0) - (parseInt(b.codigo.slice(1), 10) || 0));
}

function pintarFormulario(el) {
  el.innerHTML = `
    <form class="formulario registro-formulario" data-form-registro novalidate>
      <section class="registro-seccion">
        <h2 class="subtitulo" style="margin-top:0">1. Datos personales</h2>
        <p class="texto-mudo texto-pequeno">Identificación, rol y procedencia institucional.</p>
        <label class="campo"><span>Grupo o rol *</span>
          <select name="rol" required>
            <option value="">Selecciona</option>
            ${ROLES.map((r) => `<option value="${r.v}">${escapeHtml(r.t)}</option>`).join('')}
          </select>
        </label>
        <div class="formulario__fila">
          <label class="campo"><span>Nombre *</span><input name="nombre" required /></label>
          <label class="campo"><span>Apellido *</span><input name="apellido" required /></label>
        </div>
        <div class="formulario__fila">
          <label class="campo"><span>Edad</span><input name="edad" type="number" min="0" max="120" /></label>
          <label class="campo"><span>Teléfono</span><input name="telefono" type="tel" /></label>
          <label class="campo"><span>Correo electrónico</span><input name="correo" type="email" /></label>
        </div>
        <div class="formulario__fila">
          <label class="campo"><span>Regional educativa</span>
            <select name="regional" data-regional>
              <option value="N/A">N/A</option>
              ${regionales.map((r) => `<option value="${escapeHtml(r.codigo)}">${escapeHtml(r.codigo)}</option>`).join('')}
            </select>
          </label>
          <label class="campo"><span>Centro educativo</span><input name="centro_educativo" /></label>
        </div>
        <p class="texto-mudo texto-pequeno" data-regional-info></p>
      </section>

      <section class="registro-seccion">
        <h2 class="subtitulo">2. Salud y soporte</h2>
        <p class="texto-mudo texto-pequeno">Condición médica, alergias, tratamiento y contacto de emergencia.</p>
        <label class="campo"><span>Diagnóstico o condición médica</span>
          <select name="diagnostico">${DIAGNOSTICOS.map((d) => `<option value="${d}">${d}</option>`).join('')}</select>
        </label>
        <label class="campo"><span>Alergias</span><input name="alergias" /></label>
        <label class="campo"><span>Tratamiento para la condición</span><input name="tratamiento" /></label>
        <div class="formulario__fila">
          <label class="campo"><span>Contacto de emergencia</span><input name="contacto_emergencia" /></label>
          <label class="campo"><span>Teléfono de emergencia</span><input name="telefono_emergencia" type="tel" /></label>
        </div>
      </section>

      <section class="registro-seccion">
        <h2 class="subtitulo">3. Hospedaje</h2>
        <p class="texto-mudo texto-pequeno">Habitación, compañero y líder de edificio o bloque.</p>
        <div class="formulario__fila">
          <label class="campo"><span>Número de habitación</span><input name="numero_habitacion" /></label>
          <label class="campo"><span>Compañero(a) de habitación</span><input name="companero_habitacion" /></label>
          <label class="campo"><span>Líder de edificio o bloque</span><input name="lider_edificio" /></label>
        </div>
      </section>

      <section class="registro-seccion">
        <h2 class="subtitulo">4. Documentos</h2>
        <label class="campo">
          <span>Foto 2x2</span>
          <input name="foto" type="file" accept="image/*" capture="environment" />
        </label>
        <p class="texto-mudo texto-pequeno">Imagen frontal reciente.</p>
        <label class="campo">
          <span>Certificado médico en PDF *</span>
          <input name="certificado" type="file" accept="application/pdf" required />
        </label>
        <p class="texto-mudo texto-pequeno">Documento obligatorio para todos los roles.</p>
      </section>

      <button type="submit" class="boton boton--primario boton--ancho" data-enviar>Registrar y generar QR</button>
    </form>
    <div data-resultado hidden></div>
  `;

  const form = el.querySelector('[data-form-registro]');
  const selectRegional = form.querySelector('[data-regional]');
  const infoRegional = el.querySelector('[data-regional-info]');
  selectRegional.addEventListener('change', () => {
    const r = regionales.find((x) => x.codigo === selectRegional.value);
    if (!r || (!r.tecnico_nombre && !r.receptor_nombre)) { infoRegional.textContent = ''; return; }
    const partes = [];
    if (r.tecnico_nombre) partes.push(`Técnico regional: ${r.tecnico_nombre}${r.tecnico_telefono ? `, ${r.tecnico_telefono}` : ''}`);
    if (r.receptor_nombre) partes.push(`Recepción de invitados: ${r.receptor_nombre}${r.receptor_telefono ? `, ${r.receptor_telefono}` : ''}`);
    infoRegional.textContent = `${r.codigo} · ${partes.join(' · ')}`;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    enviar(form);
  });
}

async function enviar(form) {
  const boton = form.querySelector('[data-enviar]');
  const certificado = form.querySelector('[name="certificado"]').files[0];
  if (!certificado) { mostrarAviso('El certificado médico en PDF es obligatorio.', 'error'); return; }
  if (certificado.type !== 'application/pdf') { mostrarAviso('El certificado médico debe ser un archivo PDF.', 'error'); return; }
  if (certificado.size > 8 * 1024 * 1024) { mostrarAviso('El certificado médico no puede pesar más de 8MB.', 'error'); return; }

  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Enviando…';

  try {
    const datos = new FormData(form);
    const fotoOriginal = form.querySelector('[name="foto"]').files[0];
    if (fotoOriginal) {
      const fotoComprimida = await comprimirImagen(fotoOriginal, { maxLadoPx: 800, topeBytes: 60 * 1024 });
      datos.set('foto', fotoComprimida, 'foto.jpg');
    } else {
      datos.delete('foto');
    }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/registrar-acreditado`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY },
      body: datos,
    });
    const resultado = await resp.json();
    if (!resp.ok) throw new Error(resultado.error || 'No se pudo completar el registro.');

    mostrarResultado(resultado.codigo_qr);
  } catch (err) {
    mostrarAviso(mensajeError(err), 'error');
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

function mostrarResultado(codigo) {
  const form = contenedor.querySelector('[data-form-registro]');
  const cont = contenedor.querySelector('[data-resultado]');
  form.hidden = true;

  const url = `${location.origin}/verificar.html?c=${codigo}`;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();

  cont.hidden = false;
  cont.innerHTML = `
    <div class="registro-exito">
      <h2 class="subtitulo" style="margin-top:0">Registro completado</h2>
      <p>Presenta este código QR en la entrada del evento. Guárdalo o toma una captura de pantalla — no se reenvía por correo.</p>
      <div class="registro-qr">${qr.createSvgTag({ cellSize: 6, margin: 2 })}</div>
      <p class="registro-codigo">${escapeHtml(codigo)}</p>
    </div>
  `;
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = '<p class="estado-vacio">Cargando…</p>';
  regionales = await cargarRegionales();
  pintarFormulario(el);
}
