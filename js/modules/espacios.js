// Espacios, propiedades y plano. Pestañas: Plano (editor visual) y
// Asignaciones (personal por espacio y franja horaria).
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import { nombreCompleto, escapeHtml } from '../utils/formato.js';
import { hoyISO } from '../utils/fechas.js';
import { montarPlano } from './plano-editor.js';
import { puedeAsignar } from '../core/permisos.js';

let contenedor = null;
let pestanaActiva = 'plano';
let pisoActivo = '';
let intervaloEnVivo = null;
let canalEnVivo = null;
let debounceEnVivo = null;

async function fetchEspacios() {
  const { data, error } = await supabase
    .from('espacios')
    .select('id, nombre, piso, capacidad, pos_x, pos_y, ancho, alto, tipo:tipos_espacio(nombre), estado:estados_espacio(nombre)')
    .eq('activo', true)
    .order('nombre');
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

async function fetchCargosVisibles() {
  const { data } = await supabase
    .from('cargos')
    .select('id, nombre, persona:personas!cargos_persona_id_fkey(nombre, apellido)')
    .eq('activo', true)
    .order('nombre');
  return (data || []).filter((c) => c.persona);
}

async function fetchAsignaciones(fecha) {
  let query = supabase
    .from('asignaciones_espacio')
    .select('id, fecha, hora_inicio, hora_fin, espacio:espacios(id, nombre), cargo:cargos!asignaciones_espacio_cargo_id_fkey(id, nombre, persona:personas!cargos_persona_id_fkey(nombre, apellido))')
    .order('fecha', { ascending: false })
    .order('hora_inicio');
  if (fecha) query = query.eq('fecha', fecha);
  const { data, error } = await query.limit(100);
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

// "En vivo" no guarda un estado propio del espacio: lo calcula al vuelo
// contra las actividades de hoy que apuntan a ese espacio_id, comparando
// la hora local del navegador (no una franja server-side — es solo para
// mostrar "ahora mismo"). Se vuelve a pedir cuando Realtime avisa que
// `actividades` cambió (Bloque D, 0042), y cada 30s como respaldo del
// reloj — ver comentario en pintarEnVivo().
async function fetchActividadesHoy() {
  const { data, error } = await supabase
    .from('actividades')
    .select('id, codigo, nombre, espacio_id, hora_inicio, hora_fin, estado')
    .eq('fecha', hoyISO())
    .not('espacio_id', 'is', null)
    .neq('estado', 'cancelada');
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}

function horaActualLocal() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}

function calcularEstadoEnVivo(espacio, actividadesHoy, ahora) {
  const propias = actividadesHoy.filter((a) => a.espacio_id === espacio.id && a.hora_inicio && a.hora_fin);

  const enCurso = propias.find((a) => a.hora_inicio <= ahora && ahora <= a.hora_fin);
  if (enCurso) {
    return { estado: 'en-sesion', etiqueta: 'En sesión', detalle: `${enCurso.codigo} · ${enCurso.nombre} · hasta ${enCurso.hora_fin.slice(0, 5)}` };
  }

  const proxima = [...propias].filter((a) => a.hora_inicio > ahora).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))[0];
  if (proxima) {
    return { estado: 'proximo', etiqueta: 'Próxima sesión', detalle: `${proxima.hora_inicio.slice(0, 5)} · ${proxima.codigo} · ${proxima.nombre}` };
  }

  if (propias.some((a) => a.hora_fin < ahora)) {
    return { estado: 'cerrado', etiqueta: 'Sesiones terminadas', detalle: 'No hay más actividad programada aquí hoy.' };
  }

  return { estado: 'libre', etiqueta: 'Libre', detalle: 'Sin actividad programada aquí hoy.' };
}

async function pintarEnVivo(el, espacios) {
  el.innerHTML = `
    <p class="texto-mudo texto-pequeno" data-actualizado></p>
    <div data-tabla-envivo></div>
  `;

  // Dos causas de cambio, dos costos distintos: repintar() solo recalcula
  // contra lo ya cacheado (el reloj avanzó, sin red); refrescarDatos()
  // vuelve a pedir la base (algo escribió en actividades, vía Realtime).
  let actividadesHoy = [];

  function repintar() {
    const ahora = horaActualLocal();
    const vivos = espacios.map((e) => ({ ...e, vivo: calcularEstadoEnVivo(e, actividadesHoy, ahora) }));

    const tabla = crearTabla([
      { clave: 'nombre', titulo: 'Espacio' },
      { clave: 'piso', titulo: 'Piso' },
      { clave: 'capacidad', titulo: 'Capacidad' },
      {
        clave: 'estado',
        titulo: 'Estado ahora',
        html: true,
        render: (e) => `<span class="estado estado--${e.vivo.estado}">${escapeHtml(e.vivo.etiqueta)}</span>`,
        ordenarPor: (e) => e.vivo.estado,
      },
      { clave: 'detalle', titulo: 'Detalle', render: (e) => e.vivo.detalle, ordenarPor: (e) => e.vivo.detalle },
    ], vivos);

    const contTabla = el.querySelector('[data-tabla-envivo]');
    if (contTabla) contTabla.replaceChildren(tabla);
    const marcaTiempo = el.querySelector('[data-actualizado]');
    if (marcaTiempo) marcaTiempo.textContent = `Actualizado ${new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })} · cambios en vivo, reloj revisado cada 30s`;
  }

  async function refrescarDatos() {
    actividadesHoy = await fetchActividadesHoy();
    repintar();
  }

  await refrescarDatos();
  if (intervaloEnVivo) clearInterval(intervaloEnVivo);
  intervaloEnVivo = setInterval(repintar, 30000);

  // Realtime cubre "cambió una actividad" (escritura, rara); el setInterval
  // de arriba cubre "el reloj cruzó una hora de inicio/fin" (sin red,
  // recompute local contra lo ya cacheado). Sin filtro de fecha a
  // propósito: un canal fijado a fecha=eq.<hoy de apertura> quedaría mudo
  // tras medianoche si la pestaña sigue abierta en un evento de varios
  // días; el costo de no filtrar es despreciable (ver presupuesto en
  // README, Bloque D).
  if (canalEnVivo) { supabase.removeChannel(canalEnVivo); canalEnVivo = null; }
  canalEnVivo = supabase
    .channel('en-vivo-actividades')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'actividades' }, () => {
      clearTimeout(debounceEnVivo);
      debounceEnVivo = setTimeout(refrescarDatos, 400);
    })
    .subscribe();
}

async function pintarPlano(el, espacios) {
  const pisos = [...new Set(espacios.map((e) => e.piso).filter(Boolean))].sort();
  el.innerHTML = `
    <div class="filtros-chip" data-pisos>
      <button type="button" class="chip${pisoActivo === '' ? ' chip--activo' : ''}" data-piso="">Todos los pisos</button>
      ${pisos.map((p) => `<button type="button" class="chip${pisoActivo === p ? ' chip--activo' : ''}" data-piso="${escapeHtml(p)}">Piso ${escapeHtml(p)}</button>`).join('')}
    </div>
    <p class="texto-mudo texto-pequeno">
      <a href="/croquis-publico.html" target="_blank" rel="noopener">Ver croquis público — sin sesión, para compartir</a>
    </p>
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
    const { sesion } = getEstado();
    montarPlano(el.querySelector('[data-lienzo-envoltorio]'), { espacios: filtrados, editable: puedeAsignar(sesion) });
  }
  renderizarLienzo();
}

async function generarTarea(asignacion) {
  const { sesion } = getEstado();
  const { error } = await supabase.from('tareas').insert({
    titulo: `Cubrir ${asignacion.espacio?.nombre} (${asignacion.hora_inicio}–${asignacion.hora_fin})`,
    descripcion: 'Tarea generada desde una asignación de espacio.',
    responsable_cargo_id: asignacion.cargo?.id,
    supervisor_cargo_id: sesion.cargo.id,
    fecha_limite: asignacion.fecha,
    estado: 'no_iniciada',
    creada_por: sesion.cargo.id,
  });
  if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
  mostrarAviso('Tarea generada.', 'exito');
}

async function pintarAsignaciones(el, espacios) {
  const { sesion } = getEstado();
  const hoy = hoyISO();
  const cargos = puedeAsignar(sesion) ? await fetchCargosVisibles() : [];
  const asignaciones = await fetchAsignaciones(hoy);

  const cubiertos = new Set(asignaciones.map((a) => a.espacio?.id));
  const descubiertos = espacios.filter((e) => !cubiertos.has(e.id));

  el.innerHTML = `
    <p class="texto-mudo">Cobertura de hoy: ${cubiertos.size}/${espacios.length} espacios cubiertos${descubiertos.length ? ` — sin cubrir: ${descubiertos.map((e) => escapeHtml(e.nombre)).join(', ')}` : ''}.</p>
    ${puedeAsignar(sesion) ? `
      <form class="formulario" data-form-asignacion>
        <div class="formulario__fila">
          <label class="campo"><span>Espacio</span><select name="espacio_id" required>${opcionesSelect(espacios, { valor: 'id', etiqueta: 'nombre', vacio: 'Elige un espacio' })}</select></label>
          <label class="campo"><span>Persona</span><select name="cargo_id" required>${opcionesSelect(cargos, { valor: 'id', etiqueta: (c) => `${nombreCompleto(c.persona)} · ${c.nombre}`, vacio: 'Elige una persona' })}</select></label>
        </div>
        <div class="formulario__fila">
          <label class="campo"><span>Fecha</span><input name="fecha" type="date" required value="${hoy}" /></label>
          <label class="campo"><span>Hora inicio</span><input name="hora_inicio" type="time" required /></label>
          <label class="campo"><span>Hora fin</span><input name="hora_fin" type="time" required /></label>
        </div>
        <button type="submit" class="boton boton--primario boton--ancho">${icono('mas', { tamano: 16 })} Asignar</button>
      </form>
    ` : ''}
    <div data-tabla></div>
  `;

  const form = el.querySelector('[data-form-asignacion]');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = datosFormulario(e.target);
      const { error } = await supabase.from('asignaciones_espacio').insert({ ...datos, creado_por: sesion.cargo.id });
      if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
      mostrarAviso('Espacio asignado.', 'exito');
      pintarPestana();
    });
  }

  const tabla = crearTabla([
    { clave: 'espacio', titulo: 'Espacio', render: (a) => a.espacio?.nombre ?? '—', ordenarPor: (a) => a.espacio?.nombre || '' },
    { clave: 'persona', titulo: 'Persona', render: (a) => nombreCompleto(a.cargo?.persona), ordenarPor: (a) => nombreCompleto(a.cargo?.persona) },
    { clave: 'fecha', titulo: 'Fecha' },
    { clave: 'horario', titulo: 'Horario', render: (a) => `${a.hora_inicio}–${a.hora_fin}`, ordenarPor: (a) => a.hora_inicio },
  ], asignaciones);

  if (puedeAsignar(sesion)) {
    tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
      const asignacion = asignaciones[i];
      if (!asignacion) return;
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'boton boton--fantasma boton--pequeno';
      btn.textContent = 'Generar tarea';
      btn.addEventListener('click', () => generarTarea(asignacion));
      td.appendChild(btn);
      tr.appendChild(td);
    });
  }

  el.querySelector('[data-tabla]').replaceChildren(tabla);
}

async function pintarPestana() {
  if (pestanaActiva !== 'envivo' && intervaloEnVivo) {
    clearInterval(intervaloEnVivo);
    intervaloEnVivo = null;
  }
  if (pestanaActiva !== 'envivo' && canalEnVivo) {
    supabase.removeChannel(canalEnVivo);
    canalEnVivo = null;
    clearTimeout(debounceEnVivo);
  }
  const cuerpo = contenedor.querySelector('[data-cuerpo]');
  cuerpo.innerHTML = esqueletoTabla();
  const espacios = await fetchEspacios();
  if (pestanaActiva === 'plano') await pintarPlano(cuerpo, espacios);
  else if (pestanaActiva === 'envivo') await pintarEnVivo(cuerpo, espacios);
  else await pintarAsignaciones(cuerpo, espacios);
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Espacios</h1></div>
    <div class="filtros-chip" data-pestanas>
      <button type="button" class="chip chip--activo" data-pestana="plano">Plano</button>
      <button type="button" class="chip" data-pestana="envivo">En vivo</button>
      <button type="button" class="chip" data-pestana="asignaciones">Asignaciones</button>
    </div>
    <div data-cuerpo></div>
  `;
  el.querySelector('[data-pestanas]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pestana]');
    if (!btn) return;
    pestanaActiva = btn.dataset.pestana;
    el.querySelectorAll('[data-pestana]').forEach((b) => b.classList.toggle('chip--activo', b === btn));
    pintarPestana();
  });
  await pintarPestana();
}

export function destroy() {
  if (intervaloEnVivo) clearInterval(intervaloEnVivo);
  intervaloEnVivo = null;
  if (canalEnVivo) supabase.removeChannel(canalEnVivo);
  canalEnVivo = null;
  clearTimeout(debounceEnVivo);
  contenedor = null;
}
