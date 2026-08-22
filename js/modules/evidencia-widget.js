// Widget de evidencia embebido en tarea.html: siempre vive dentro de la
// tarea a la que pertenece, no se navega suelto.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { abrirModal } from '../ui/modal.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { comprimirImagen } from '../utils/imagen.js';
import { nombreCompleto, escapeHtml } from '../utils/formato.js';
import { esResponsableDe, puedeAprobarODevolver } from '../core/permisos.js';

const ESTADO_LABEL = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };

async function fetchEvidencias(tareaId) {
  const { data, error } = await supabase
    .from('evidencias')
    .select('*, autor:cargos!evidencias_autor_cargo_id_fkey(nombre, persona:personas(nombre, apellido))')
    .eq('tarea_id', tareaId)
    .order('creada_en', { ascending: false });
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

async function fetchTopeBytes() {
  const { data } = await supabase
    .from('configuracion_sistema')
    .select('valor')
    .eq('clave', 'evidencia_tope_kb')
    .single();
  return (Number(data?.valor) || 800) * 1024;
}

async function urlFirmada(path) {
  const { data } = await supabase.storage.from('evidencias').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

async function subirEvidencia(tarea, archivo, reporte, alTerminar) {
  const { sesion } = getEstado();
  let blob;
  try {
    const tope = await fetchTopeBytes();
    blob = archivo ? await comprimirImagen(archivo, { topeBytes: tope }) : null;
  } catch (err) {
    mostrarAviso(err.message, 'error');
    return;
  }

  let fotoPath = null;
  if (blob) {
    fotoPath = `${tarea.id}/${crypto.randomUUID()}.jpg`;
    const { error: errSubida } = await supabase.storage.from('evidencias').upload(fotoPath, blob, { contentType: 'image/jpeg' });
    if (errSubida) { mostrarAviso(mensajeError(errSubida), 'error'); return; }
  }

  const { error } = await supabase.from('evidencias').insert({
    tarea_id: tarea.id,
    autor_cargo_id: sesion.cargo.id,
    foto_path: fotoPath,
    tamano_bytes: blob?.size ?? null,
    reporte,
  });

  if (error) {
    if (fotoPath) await supabase.storage.from('evidencias').remove([fotoPath]);
    mostrarAviso(mensajeError(error), 'error');
    return;
  }

  mostrarAviso('Evidencia enviada.', 'exito');
  alTerminar();
}

function abrirModalSubir(tarea, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <form class="formulario" data-form>
      <label class="campo">
        <span>Foto (opcional)</span>
        <input type="file" name="foto" accept="image/*" capture="environment" />
      </label>
      <label class="campo"><span>Reporte</span><textarea name="reporte" rows="3" required></textarea></label>
      <button type="submit" class="boton boton--primario boton--ancho">${icono('adjunto', { tamano: 16 })} Enviar evidencia</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: 'Adjuntar evidencia', contenido: div, ancho: 'angosto' });
  div.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const archivo = div.querySelector('[name="foto"]').files[0] || null;
    const reporte = div.querySelector('[name="reporte"]').value.trim();
    const boton = div.querySelector('button[type="submit"]');
    boton.disabled = true;
    await subirEvidencia(tarea, archivo, reporte, () => { cerrar(); alTerminar(); });
    boton.disabled = false;
  });
}

function abrirModalRechazo(evidencia, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <form class="formulario" data-form>
      <label class="campo"><span>Motivo</span><textarea name="motivo_rechazo" rows="3" required></textarea></label>
      <button type="submit" class="boton boton--primario boton--ancho">Rechazar evidencia</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: 'Rechazar evidencia', contenido: div, ancho: 'angosto' });
  div.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const motivo = div.querySelector('[name="motivo_rechazo"]').value.trim();
    const { error } = await supabase.from('evidencias').update({ estado: 'rechazada', motivo_rechazo: motivo }).eq('id', evidencia.id);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Evidencia rechazada.', 'exito');
    cerrar();
    alTerminar();
  });
}

function abrirModalAprobacion(evidencia, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <form class="formulario" data-form>
      <label class="campo"><span>Puntaje</span><input type="number" name="puntaje" min="0" max="100" step="0.5" required /></label>
      <button type="submit" class="boton boton--primario boton--ancho">Aprobar evidencia</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: 'Aprobar evidencia', contenido: div, ancho: 'angosto' });
  div.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const puntaje = Number(div.querySelector('[name="puntaje"]').value);
    const { error } = await supabase.from('evidencias').update({ estado: 'aprobada', puntaje }).eq('id', evidencia.id);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Evidencia aprobada.', 'exito');
    cerrar();
    alTerminar();
  });
}

async function tarjetaEvidencia(evidencia) {
  const div = document.createElement('div');
  div.className = 'evidencia-tarjeta';
  const enlace = evidencia.foto_path ? await urlFirmada(evidencia.foto_path) : null;

  div.innerHTML = `
    <div class="evidencia-tarjeta__cima">
      <span class="${'estado estado--' + evidencia.estado}">${ESTADO_LABEL[evidencia.estado]}</span>
      <span class="texto-mudo texto-pequeno">${escapeHtml(nombreCompleto(evidencia.autor?.persona))} · ${new Date(evidencia.creada_en).toLocaleDateString('es-DO')}</span>
    </div>
    ${enlace ? `<a href="${enlace}" target="_blank" rel="noopener" class="evidencia-foto-enlace">${icono('adjunto', { tamano: 14 })} Ver foto</a>` : (evidencia.foto_path === null && evidencia.purgada_en ? '<p class="texto-mudo texto-pequeno">Foto purgada; el reporte se conserva.</p>' : '')}
    <p>${escapeHtml(evidencia.reporte)}</p>
    ${evidencia.estado === 'aprobada' ? `<p class="texto-mudo texto-pequeno">Puntaje: ${evidencia.puntaje}</p>` : ''}
    ${evidencia.estado === 'rechazada' ? `<p class="texto-danger texto-pequeno">${escapeHtml(evidencia.motivo_rechazo)}</p>` : ''}
    <div class="tarjeta-tarea__acciones" data-acciones></div>
  `;
  return div;
}

export async function montarEvidencia(el, { tarea }) {
  const { sesion } = getEstado();
  const evidencias = await fetchEvidencias(tarea.id);

  el.innerHTML = '<h2 class="subtitulo">Evidencia</h2>';

  if (esResponsableDe(sesion, tarea)) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton boton--secundario';
    boton.innerHTML = `${icono('adjunto', { tamano: 16 })} Adjuntar evidencia`;
    boton.addEventListener('click', () => abrirModalSubir(tarea, () => montarEvidencia(el, { tarea })));
    el.appendChild(boton);
  }

  if (evidencias.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'estado-vacio';
    vacio.textContent = 'Sin evidencia adjunta todavía.';
    el.appendChild(vacio);
    return;
  }

  const lista = document.createElement('div');
  lista.className = 'evidencia-lista';
  for (const evidencia of evidencias) {
    const tarjeta = await tarjetaEvidencia(evidencia);
    if (evidencia.estado === 'pendiente' && puedeAprobarODevolver(sesion, tarea)) {
      const acciones = tarjeta.querySelector('[data-acciones]');
      const aprobarBtn = document.createElement('button');
      aprobarBtn.className = 'boton boton--primario boton--pequeno';
      aprobarBtn.textContent = 'Aprobar';
      aprobarBtn.addEventListener('click', () => abrirModalAprobacion(evidencia, () => montarEvidencia(el, { tarea })));
      const rechazarBtn = document.createElement('button');
      rechazarBtn.className = 'boton boton--secundario boton--pequeno';
      rechazarBtn.textContent = 'Rechazar';
      rechazarBtn.addEventListener('click', () => abrirModalRechazo(evidencia, () => montarEvidencia(el, { tarea })));
      acciones.append(aprobarBtn, rechazarBtn);
    }
    lista.appendChild(tarjeta);
  }
  el.appendChild(lista);
}
