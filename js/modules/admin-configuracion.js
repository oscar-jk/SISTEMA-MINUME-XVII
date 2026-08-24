// Configuración del sistema: tolerancias de puntualidad, ventana de purga
// de evidencia, fechas del evento y ventanas de corte. Todo aquí, nada
// codificado en el frontend.
import { supabase } from '../core/supabase.js';
import { llamarFuncion } from '../core/edge-functions.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';

let contenedor = null;

async function fetchConfig() {
  const { data } = await supabase.from('configuracion_sistema').select('clave, valor');
  const mapa = {};
  for (const fila of data || []) mapa[fila.clave] = fila.valor;
  return mapa;
}

async function guardarConfig(clave, valor) {
  const { error } = await supabase.from('configuracion_sistema').upsert({ clave, valor });
  if (error) throw error;
}

async function pintarFechasYPurga(el, config) {
  el.innerHTML = `
    <form class="formulario" data-form-fechas>
      <h3 class="subtitulo" style="margin-top:0">Fechas del evento</h3>
      <div class="formulario__fila">
        <label class="campo"><span>Inicio</span><input name="fecha_evento_inicio" type="date" value="${config.fecha_evento_inicio ?? ''}" required /></label>
        <label class="campo"><span>Fin</span><input name="fecha_evento_fin" type="date" value="${config.fecha_evento_fin ?? ''}" required /></label>
      </div>
      <button type="submit" class="boton boton--secundario">Guardar fechas</button>
    </form>

    <form class="formulario" data-form-evidencia style="margin-top:1.5rem">
      <h3 class="subtitulo">Evidencia</h3>
      <div class="formulario__fila">
        <label class="campo"><span>Ventana de purga (días)</span><input name="evidencia_ventana_purga_dias" type="number" min="1" value="${config.evidencia_ventana_purga_dias ?? 90}" required /></label>
        <label class="campo"><span>Tope por foto (KB)</span><input name="evidencia_tope_kb" type="number" min="50" value="${config.evidencia_tope_kb ?? 800}" required /></label>
      </div>
      <button type="submit" class="boton boton--secundario">Guardar</button>
    </form>

    <div class="tarjeta-tarea" style="margin-top:1.5rem">
      <h3 class="subtitulo" style="margin-top:0">Purgar evidencia ahora</h3>
      <p class="texto-mudo">Borra las fotos ya revisadas dentro de la ventana configurada. El reporte, estado y puntaje se conservan.</p>
      <button type="button" class="boton boton--primario" data-purgar>${icono('reintentar', { tamano: 16 })} Purgar por ventana</button>
    </div>
  `;

  el.querySelector('[data-form-fechas]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    try {
      await guardarConfig('fecha_evento_inicio', datos.fecha_evento_inicio);
      await guardarConfig('fecha_evento_fin', datos.fecha_evento_fin);
      mostrarAviso('Fechas del evento guardadas.', 'exito');
    } catch (err) { mostrarAviso(mensajeError(err), 'error'); }
  });

  el.querySelector('[data-form-evidencia]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    try {
      await guardarConfig('evidencia_ventana_purga_dias', Number(datos.evidencia_ventana_purga_dias));
      await guardarConfig('evidencia_tope_kb', Number(datos.evidencia_tope_kb));
      mostrarAviso('Configuración de evidencia guardada.', 'exito');
    } catch (err) { mostrarAviso(mensajeError(err), 'error'); }
  });

  el.querySelector('[data-purgar]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const resultado = await llamarFuncion('purgar-evidencia', { modo: 'ventana' });
      mostrarAviso(`Purga completa: ${resultado.purgadas} fotos eliminadas.`, 'exito');
    } catch (err) {
      mostrarAviso(mensajeError(err), 'error');
    } finally {
      e.target.disabled = false;
    }
  });
}

async function pintarTolerancias(el) {
  const [{ data: subsecretarias }, { data: comisiones }, { data: filas }] = await Promise.all([
    supabase.from('subsecretarias').select('id, nombre').order('nombre'),
    supabase.from('comisiones').select('id, nombre').order('nombre'),
    supabase.from('tolerancias_puntualidad').select('*, subsecretaria:subsecretarias(nombre), comision:comisiones(nombre)'),
  ]);
  el.innerHTML = `
    <h3 class="subtitulo" style="margin-top:0">Tolerancias de puntualidad</h3>
    <form class="formulario" data-form>
      <div class="formulario__fila">
        <label class="campo">
          <span>Rama</span>
          <select name="objetivo" required>
            <option value="">Elige una rama</option>
            <optgroup label="Subsecretarías">${opcionesSelect(subsecretarias || [], { valor: (s) => `sub:${s.id}`, etiqueta: 'nombre' })}</optgroup>
            <optgroup label="Comisiones">${opcionesSelect(comisiones || [], { valor: (c) => `com:${c.id}`, etiqueta: 'nombre' })}</optgroup>
          </select>
        </label>
        <label class="campo"><span>Hora programada</span><input name="hora_programada" type="time" required /></label>
        <label class="campo"><span>Tolerancia (minutos)</span><input name="tolerancia_minutos" type="number" min="0" value="10" required /></label>
      </div>
      <button type="submit" class="boton boton--secundario">${icono('mas', { tamano: 16 })} Guardar</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const [prefijo, id] = (datos.objetivo || '').split(':');
    if (!prefijo || !id) { mostrarAviso('Elige una rama.', 'error'); return; }
    const fila = {
      subsecretaria_id: prefijo === 'sub' ? id : null,
      comision_id: prefijo === 'com' ? id : null,
      hora_programada: datos.hora_programada,
      tolerancia_minutos: Number(datos.tolerancia_minutos),
    };
    // upsert con onConflict no sirve aquí: el "conflicto" real está en un
    // índice único PARCIAL (where subsecretaria_id/comision_id is not
    // null, ver 0030), y PostgREST no puede inferir ese predicado — se
    // resuelve con un select-then-insert-or-update explícito.
    const columna = fila.subsecretaria_id ? 'subsecretaria_id' : 'comision_id';
    const valor = fila.subsecretaria_id || fila.comision_id;
    const { data: existente } = await supabase.from('tolerancias_puntualidad').select('id').eq(columna, valor).maybeSingle();
    const { error } = existente
      ? await supabase.from('tolerancias_puntualidad').update(fila).eq('id', existente.id)
      : await supabase.from('tolerancias_puntualidad').insert(fila);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Tolerancia guardada.', 'exito');
    await pintarTolerancias(el);
  });
  el.querySelector('[data-lista]').replaceChildren(crearTabla([
    {
      clave: 'rama',
      titulo: 'Rama',
      render: (f) => f.subsecretaria?.nombre || f.comision?.nombre || '—',
      ordenarPor: (f) => f.subsecretaria?.nombre || f.comision?.nombre || '',
    },
    { clave: 'hora_programada', titulo: 'Hora programada', render: (f) => f.hora_programada.slice(0, 5) },
    { clave: 'tolerancia_minutos', titulo: 'Tolerancia (min)' },
  ], filas || []));
}

async function pintarCortes(el) {
  const { data: filas } = await supabase.from('cortes_evaluacion').select('*').order('fecha_inicio');
  el.innerHTML = `
    <h3 class="subtitulo" style="margin-top:0">Ventanas de corte</h3>
    <form class="formulario" data-form>
      <div class="formulario__fila">
        <label class="campo"><span>Nombre</span><input name="nombre" required /></label>
        <label class="campo"><span>Inicio</span><input name="fecha_inicio" type="date" required /></label>
        <label class="campo"><span>Fin</span><input name="fecha_fin" type="date" required /></label>
      </div>
      <label class="campo" style="flex-direction:row;align-items:center;gap:0.5em">
        <input type="checkbox" name="bloquea_salida" style="min-height:auto;width:auto" />
        <span>Bloquea la salida mientras esté abierto</span>
      </label>
      <button type="submit" class="boton boton--secundario">${icono('mas', { tamano: 16 })} Crear corte</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const datos = datosFormulario(form);
    datos.bloquea_salida = form.querySelector('[name="bloquea_salida"]').checked;
    const { error } = await supabase.from('cortes_evaluacion').insert(datos);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Corte creado.', 'exito');
    await pintarCortes(el);
  });

  const tabla = crearTabla([
    { clave: 'nombre', titulo: 'Nombre' },
    { clave: 'fecha_inicio', titulo: 'Inicio' },
    { clave: 'fecha_fin', titulo: 'Fin' },
    { clave: 'bloquea_salida', titulo: 'Bloquea salida', render: (f) => (f.bloquea_salida ? 'Sí' : 'No') },
    { clave: 'cerrado', titulo: 'Cerrado', render: (f) => (f.cerrado ? 'Sí' : 'No') },
  ], filas || []);

  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const corte = (filas || [])[i];
    if (!corte) return;
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boton boton--fantasma boton--pequeno';
    btn.textContent = corte.cerrado ? 'Reabrir' : 'Cerrar';
    btn.addEventListener('click', async () => {
      const { error } = await supabase.from('cortes_evaluacion').update({ cerrado: !corte.cerrado }).eq('id', corte.id);
      if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
      await pintarCortes(el);
    });
    td.appendChild(btn);
    tr.appendChild(td);
  });

  el.querySelector('[data-lista]').replaceChildren(tabla);
}

export async function render(el) {
  contenedor = el;
  const config = await fetchConfig();
  el.innerHTML = `
    <div class="vista-cabecera"><h1>Configuración</h1></div>
    <div data-fechas></div>
    <div data-tolerancias style="margin-top:2rem"></div>
    <div data-cortes style="margin-top:2rem"></div>
  `;
  await pintarFechasYPurga(el.querySelector('[data-fechas]'), config);
  await pintarTolerancias(el.querySelector('[data-tolerancias]'));
  await pintarCortes(el.querySelector('[data-cortes]'));
}

export function destroy() {
  contenedor = null;
}
