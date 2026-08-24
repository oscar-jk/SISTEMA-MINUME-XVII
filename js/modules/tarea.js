import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { encolarAvance } from '../core/cola.js';
import { abrirModal } from '../ui/modal.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { etiquetaPlazo, estaVencida } from '../utils/fechas.js';
import {
  ESTADO_TAREA_LABEL, PRIORIDAD_LABEL, nombreCompleto, escapeHtml,
} from '../utils/formato.js';
import {
  puedeRegistrarAvance, puedeEnviarRevision, puedeAprobarODevolver,
} from '../core/permisos.js';
import { montarEvidencia } from './evidencia-widget.js';
import { esqueletoTexto } from '../ui/esqueleto.js';

let contenedor = null;
let idTarea = null;

async function cargarTarea(id) {
  const { data, error } = await supabase
    .from('tareas')
    .select(`
      *,
      actividad:actividades(id, codigo, nombre, fecha),
      responsable:cargos!tareas_responsable_cargo_id_fkey(id, nombre, persona:personas(nombre, apellido)),
      supervisor:cargos!tareas_supervisor_cargo_id_fkey(id, nombre, persona:personas(nombre, apellido))
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function cargarAvances(id) {
  const { data, error } = await supabase
    .from('avances_tarea')
    .select('id, nota, progreso_reportado, fecha, autor:cargos!avances_tarea_autor_cargo_id_fkey(nombre, persona:personas(nombre, apellido))')
    .eq('tarea_id', id)
    .order('fecha', { ascending: true });
  if (error) throw error;
  return data;
}

async function cargarReasignaciones(id) {
  const { data, error } = await supabase
    .from('historial_reasignacion_tarea')
    .select(`
      id, campo, cambiado_en,
      anterior:cargos!historial_reasignacion_tarea_cargo_anterior_id_fkey(nombre, persona:personas(nombre, apellido)),
      nuevo:cargos!historial_reasignacion_tarea_cargo_nuevo_id_fkey(nombre, persona:personas(nombre, apellido))
    `)
    .eq('tarea_id', id)
    .order('cambiado_en', { ascending: false });
  if (error) return [];
  return data;
}

function abrirHojaAvance(tarea, alGuardar) {
  const sugerido = Math.min(100, (tarea.progreso || 0) + 10) || 20;
  const div = document.createElement('div');
  div.className = 'hoja-avance';
  div.innerHTML = `
    <label class="campo">
      <span>Progreso: <b data-valor>${sugerido}%</b></span>
      <input type="range" min="0" max="100" step="5" value="${sugerido}" class="deslizador" />
    </label>
    <label class="campo">
      <span>Nota (opcional)</span>
      <textarea rows="3" placeholder="¿Qué avanzaste?"></textarea>
    </label>
    <button type="button" class="boton boton--primario boton--ancho" data-guardar>
      ${icono('check', { tamano: 18 })} Guardar avance
    </button>
  `;
  const deslizador = div.querySelector('.deslizador');
  const valorTexto = div.querySelector('[data-valor]');
  deslizador.addEventListener('input', () => { valorTexto.textContent = `${deslizador.value}%`; });

  const { cerrar } = abrirModal({ titulo: 'Registrar avance', contenido: div, ancho: 'angosto' });

  div.querySelector('[data-guardar]').addEventListener('click', () => {
    const { sesion } = getEstado();
    encolarAvance({
      tarea_id: tarea.id,
      autor_cargo_id: sesion.cargo.id,
      nota: div.querySelector('textarea').value.trim() || null,
      progreso_reportado: Number(deslizador.value),
    });
    mostrarAviso('Avance guardado. Se sincroniza automáticamente.', 'exito');
    cerrar();
    alGuardar();
  });
}

function abrirHojaDevolucion(tarea, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <label class="campo">
      <span>Motivo de la devolución</span>
      <textarea rows="4" placeholder="Explica qué falta para aprobarla" required></textarea>
    </label>
    <button type="button" class="boton boton--primario boton--ancho" data-confirmar>Devolver a en curso</button>
  `;
  const { cerrar } = abrirModal({ titulo: 'Devolver tarea', contenido: div, ancho: 'angosto' });

  div.querySelector('[data-confirmar]').addEventListener('click', async () => {
    const motivo = div.querySelector('textarea').value.trim();
    if (!motivo) {
      mostrarAviso('Escribe un motivo para devolver la tarea.', 'error');
      return;
    }
    const { error } = await supabase
      .from('tareas')
      .update({ estado: 'en_curso', motivo_devolucion: motivo })
      .eq('id', tarea.id);
    if (error) {
      mostrarAviso(mensajeError(error), 'error');
      return;
    }
    mostrarAviso('Tarea devuelta.', 'exito');
    cerrar();
    alTerminar();
  });
}

async function aprobar(tarea, alTerminar) {
  const { error } = await supabase.from('tareas').update({ estado: 'completada' }).eq('id', tarea.id);
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return;
  }
  mostrarAviso('Tarea aprobada.', 'exito');
  alTerminar();
}

async function enviarARevision(tarea, alTerminar) {
  const { error } = await supabase.from('tareas').update({ estado: 'en_revision' }).eq('id', tarea.id);
  if (error) {
    mostrarAviso(mensajeError(error), 'error');
    return;
  }
  mostrarAviso('Tarea enviada a revisión.', 'exito');
  alTerminar();
}

function filaAvance(avance) {
  return `
    <li class="avance">
      <div class="avance__cima">
        <strong>${escapeHtml(nombreCompleto(avance.autor?.persona))}</strong>
        <span>${new Date(avance.fecha).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <div class="progreso-fila">
        <div class="barra-progreso barra-progreso--pequena"><div class="barra-progreso__relleno" style="width:${avance.progreso_reportado}%"></div></div>
        <span class="progreso-valor">${avance.progreso_reportado}%</span>
      </div>
      ${avance.nota ? `<p class="avance__nota">${escapeHtml(avance.nota)}</p>` : ''}
    </li>
  `;
}

async function pintar() {
  const { sesion } = getEstado();
  let tarea;
  let avances;
  let reasignaciones;
  try {
    [tarea, avances, reasignaciones] = await Promise.all([
      cargarTarea(idTarea), cargarAvances(idTarea), cargarReasignaciones(idTarea),
    ]);
  } catch (err) {
    contenedor.innerHTML = `<p class="estado-vacio">No se pudo cargar la tarea. ${escapeHtml(mensajeError(err))}</p>`;
    return;
  }

  const vencida = estaVencida(tarea);

  contenedor.innerHTML = `
    <nav class="migas-pan" aria-label="Ruta de navegación">
      <a href="/tablero.html">Tablero</a>
      <span>›</span>
      ${tarea.actividad ? `<a href="/actividad.html?id=${encodeURIComponent(tarea.actividad.id)}">${escapeHtml(tarea.actividad.codigo)}</a><span>›</span>` : ''}
      <span class="migas-pan__actual">${escapeHtml(tarea.titulo)}</span>
    </nav>
    <button type="button" class="boton boton--fantasma" data-volver>${icono('flecha-izq', { tamano: 16 })} Volver</button>
    <div class="vista-cabecera">
      <div>
        <span class="${'estado estado--' + tarea.estado.replace(/_/g, '-')}">${ESTADO_TAREA_LABEL[tarea.estado]}</span>
        <span class="${'prioridad prioridad--' + tarea.prioridad}">${PRIORIDAD_LABEL[tarea.prioridad]}</span>
        <h1>${escapeHtml(tarea.titulo)}</h1>
        ${tarea.actividad ? `<p class="texto-mudo">De la actividad ${escapeHtml(tarea.actividad.codigo)} · ${escapeHtml(tarea.actividad.nombre)}</p>` : ''}
      </div>
    </div>

    ${tarea.descripcion ? `<p>${escapeHtml(tarea.descripcion)}</p>` : ''}

    <div class="ficha-datos">
      <div><span>Responsable</span><strong>${escapeHtml(nombreCompleto(tarea.responsable?.persona))}</strong></div>
      <div><span>Supervisor</span><strong>${escapeHtml(nombreCompleto(tarea.supervisor?.persona))}</strong></div>
      <div><span>Plazo</span><strong class="${vencida ? 'texto-danger' : ''}">${etiquetaPlazo(tarea)}</strong></div>
      <div><span>Progreso</span><strong>${tarea.progreso}%</strong></div>
    </div>

    ${tarea.motivo_devolucion ? `<div class="aviso-inline aviso-inline--alerta">${icono('alerta', { tamano: 16 })} <div><strong>Motivo de la última devolución</strong><p>${escapeHtml(tarea.motivo_devolucion)}</p></div></div>` : ''}

    <div class="acciones-tarea" data-acciones></div>

    <h2 class="subtitulo">Historial de avances</h2>
    <ul class="lista-avances">
      ${avances.length ? avances.map(filaAvance).join('') : '<li class="estado-vacio">Todavía no hay avances registrados.</li>'}
    </ul>

    ${reasignaciones.length ? `
      <h2 class="subtitulo">Historial de reasignación</h2>
      <ul class="lista-avances">
        ${reasignaciones.map((r) => `
          <li class="avance">
            <p class="avance__nota">
              ${r.campo === 'responsable' ? 'Responsable' : 'Supervisor'} cambió de
              <strong>${escapeHtml(r.anterior ? nombreCompleto(r.anterior.persona) : 'sin asignar')}</strong> a
              <strong>${escapeHtml(r.nuevo ? nombreCompleto(r.nuevo.persona) : 'sin asignar')}</strong>
              — ${new Date(r.cambiado_en).toLocaleDateString('es-DO')}
            </p>
          </li>
        `).join('')}
      </ul>
    ` : ''}

    <div data-evidencia></div>
  `;

  contenedor.querySelector('[data-volver]').addEventListener('click', () => history.back());
  montarEvidencia(contenedor.querySelector('[data-evidencia]'), { tarea });

  const acciones = contenedor.querySelector('[data-acciones]');
  const refrescar = () => pintar();

  if (puedeRegistrarAvance(sesion, tarea)) {
    const b = document.createElement('button');
    b.className = 'boton boton--primario';
    b.innerHTML = `${icono('mas', { tamano: 16 })} Registrar avance`;
    b.addEventListener('click', () => abrirHojaAvance(tarea, refrescar));
    acciones.appendChild(b);
  }

  if (puedeEnviarRevision(sesion, tarea)) {
    const b = document.createElement('button');
    b.className = 'boton boton--secundario';
    b.textContent = 'Enviar a revisión';
    b.addEventListener('click', () => enviarARevision(tarea, refrescar));
    acciones.appendChild(b);
  }

  if (tarea.estado === 'en_revision' && puedeAprobarODevolver(sesion, tarea)) {
    const aprobarBtn = document.createElement('button');
    aprobarBtn.className = 'boton boton--primario';
    aprobarBtn.innerHTML = `${icono('check-circulo', { tamano: 16 })} Aprobar`;
    aprobarBtn.addEventListener('click', () => aprobar(tarea, refrescar));
    acciones.appendChild(aprobarBtn);

    const devolverBtn = document.createElement('button');
    devolverBtn.className = 'boton boton--secundario';
    devolverBtn.textContent = 'Devolver';
    devolverBtn.addEventListener('click', () => abrirHojaDevolucion(tarea, refrescar));
    acciones.appendChild(devolverBtn);
  }
}

export async function render(el, params) {
  contenedor = el;
  idTarea = params.id;
  el.innerHTML = esqueletoTexto(6);
  await pintar();
}

export function destroy() {
  contenedor = null;
  idTarea = null;
}
