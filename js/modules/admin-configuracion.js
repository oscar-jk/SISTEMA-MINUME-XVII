// Configuración del sistema: ventana de purga de evidencia, fechas del
// evento y ventanas de corte. Todo aquí, nada codificado en el frontend.
// Las tolerancias de puntualidad se mudaron a grupos-trabajo.html (Bloque
// G) — un subsecretario administra la de su propia rama ahí, no aquí
// (esta página sigue siendo solo super admin).
import { supabase } from '../core/supabase.js';
import { llamarFuncion } from '../core/edge-functions.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario } from '../ui/formulario.js';
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

// Bloque F — rúbrica de evaluación por cortes. Mismo patrón exacto que
// pintarCortes(): crear + lista con toggle por fila (aquí activo/inactivo
// en vez de cerrado/abierto).
async function pintarCriterios(el) {
  const { data: filas } = await supabase.from('criterios_evaluacion').select('*').order('codigo');
  el.innerHTML = `
    <h3 class="subtitulo" style="margin-top:0">Criterios de evaluación</h3>
    <form class="formulario" data-form>
      <div class="formulario__fila">
        <label class="campo"><span>Código</span><input name="codigo" required /></label>
        <label class="campo"><span>Nombre</span><input name="nombre" required /></label>
        <label class="campo"><span>Peso</span><input name="peso" type="number" step="0.01" min="0.01" value="1" required /></label>
      </div>
      <label class="campo"><span>Descripción (opcional)</span><textarea name="descripcion" rows="2"></textarea></label>
      <button type="submit" class="boton boton--secundario">${icono('mas', { tamano: 16 })} Crear criterio</button>
    </form>
    <div data-lista></div>
  `;
  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    datos.peso = Number(datos.peso);
    const { error } = await supabase.from('criterios_evaluacion').insert(datos);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Criterio creado.', 'exito');
    await pintarCriterios(el);
  });

  const tabla = crearTabla([
    { clave: 'codigo', titulo: 'Código' },
    { clave: 'nombre', titulo: 'Nombre' },
    { clave: 'peso', titulo: 'Peso' },
    { clave: 'activo', titulo: 'Activo', render: (f) => (f.activo ? 'Sí' : 'No') },
  ], filas || []);

  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const criterio = (filas || [])[i];
    if (!criterio) return;
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boton boton--fantasma boton--pequeno';
    btn.textContent = criterio.activo ? 'Desactivar' : 'Activar';
    btn.addEventListener('click', async () => {
      const { error } = await supabase.from('criterios_evaluacion').update({ activo: !criterio.activo }).eq('id', criterio.id);
      if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
      await pintarCriterios(el);
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
    <div data-cortes style="margin-top:2rem"></div>
    <div data-criterios style="margin-top:2rem"></div>
  `;
  await pintarFechasYPurga(el.querySelector('[data-fechas]'), config);
  await pintarCortes(el.querySelector('[data-cortes]'));
  await pintarCriterios(el.querySelector('[data-criterios]'));
}

export function destroy() {
  contenedor = null;
}
