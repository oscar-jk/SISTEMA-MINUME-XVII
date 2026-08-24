// Solicitudes de ayuda (Bloque B): cualquiera puede pedir ayuda escalando
// su propia cadena de supervisión; quien gestiona alguna rama puede además
// dirigirla a otra subsecretaría/comisión distinta. La autoridad real vive
// en RLS + fn_transicion_solicitud_ayuda (0037) — aquí solo se pinta lo que
// esas políticas ya dejaron pasar.
import { supabase } from '../core/supabase.js';
import { getEstado } from '../core/store.js';
import { icono } from '../ui/icono.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import { abrirModal } from '../ui/modal.js';
import { nombreCompleto, escapeHtml } from '../utils/formato.js';
import { puedeGestionarRamas } from '../core/permisos.js';

let contenedor = null;

const DIVISIONES = [{ v: 'sg', t: 'SG' }, { v: 'sga', t: 'SGA' }, { v: 'sgl', t: 'SGL' }];

const ESTADO_LABEL = { pendiente: 'Pendiente', atendida: 'Atendida', descartada: 'Descartada' };

function formatoFecha(iso) {
  return new Date(iso).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

async function fetchSolicitudes() {
  const { data, error } = await supabase
    .from('solicitudes_ayuda')
    .select(`
      id, titulo, descripcion, estado, respuesta, creada_en, atendida_en,
      solicitante_cargo_id,
      solicitante:cargos!solicitudes_ayuda_solicitante_cargo_id_fkey(nombre, persona:personas!cargos_persona_id_fkey(nombre, apellido)),
      destinatario_subsecretaria:subsecretarias(nombre),
      destinatario_comision:comisiones(nombre),
      atiende:cargos!solicitudes_ayuda_atendida_por_fkey(nombre, persona:personas!cargos_persona_id_fkey(nombre, apellido))
    `)
    .order('creada_en', { ascending: false });
  if (error) { mostrarAviso(mensajeError(error), 'error'); return []; }
  return data;
}
async function fetchSubsecretarias() {
  const { data } = await supabase.from('subsecretarias').select('id, nombre, division').order('nombre');
  return data || [];
}
async function fetchComisiones() {
  const { data } = await supabase.from('comisiones').select('id, nombre').order('nombre');
  return data || [];
}

function ramaTexto(s) {
  return s.destinatario_subsecretaria?.nombre || s.destinatario_comision?.nombre || null;
}

function abrirModalAtender(solicitud, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <p class="hoja-avance__tarea">${escapeHtml(solicitud.titulo)}</p>
    ${solicitud.descripcion ? `<p>${escapeHtml(solicitud.descripcion)}</p>` : ''}
    <label class="campo">
      <span>Respuesta</span>
      <textarea rows="3" placeholder="¿Cómo se resuelve o por qué se descarta?"></textarea>
    </label>
    <div class="formulario__fila">
      <button type="button" class="boton boton--secundario boton--ancho" data-descartar>Descartar</button>
      <button type="button" class="boton boton--primario boton--ancho" data-atender>${icono('check', { tamano: 16 })} Atender</button>
    </div>
  `;
  const { cerrar } = abrirModal({ titulo: 'Responder solicitud', contenido: div, ancho: 'angosto' });

  async function resolver(estado) {
    const respuesta = div.querySelector('textarea').value.trim() || null;
    const { error } = await supabase
      .from('solicitudes_ayuda')
      .update({ estado, respuesta })
      .eq('id', solicitud.id);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso(estado === 'atendida' ? 'Solicitud atendida.' : 'Solicitud descartada.', 'exito');
    cerrar();
    alTerminar();
  }

  div.querySelector('[data-atender]').addEventListener('click', () => resolver('atendida'));
  div.querySelector('[data-descartar]').addEventListener('click', () => resolver('descartada'));
}

function columnas(mostrarSolicitante) {
  const cols = [
    { clave: 'titulo', titulo: 'Título' },
    {
      clave: 'estado',
      titulo: 'Estado',
      html: true,
      render: (s) => `<span class="estado estado--${s.estado}">${ESTADO_LABEL[s.estado]}</span>`,
    },
  ];
  if (mostrarSolicitante) {
    cols.push({
      clave: 'solicitante',
      titulo: 'Quién pide',
      render: (s) => nombreCompleto(s.solicitante?.persona),
      ordenarPor: (s) => nombreCompleto(s.solicitante?.persona),
    });
  }
  cols.push(
    {
      clave: 'rama',
      titulo: 'Dirigida a',
      render: (s) => ramaTexto(s) || 'Mi cadena de supervisión',
      ordenarPor: (s) => ramaTexto(s) || '',
    },
    { clave: 'creada_en', titulo: 'Fecha', render: (s) => formatoFecha(s.creada_en) },
    { clave: 'acciones', titulo: '' },
  );
  return cols;
}

function pintarPara(el, lista, mostrarSolicitante, alTerminar) {
  if (lista.length === 0) {
    el.innerHTML = '<p class="estado-vacio">Nada por aquí.</p>';
    return;
  }
  const tabla = crearTabla(columnas(mostrarSolicitante), lista);
  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const s = lista[i];
    if (!s) return;
    const td = tr.querySelector('td:last-child');
    td.className = 'tabla__acciones';
    if (s.estado === 'pendiente' && mostrarSolicitante) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'boton boton--primario boton--pequeno';
      btn.textContent = 'Responder';
      btn.addEventListener('click', () => abrirModalAtender(s, alTerminar));
      td.appendChild(btn);
    } else if (s.respuesta) {
      const nota = document.createElement('span');
      nota.className = 'texto-mudo texto-pequeno';
      nota.textContent = s.respuesta;
      td.appendChild(nota);
    }
  });
  el.replaceChildren(tabla);
}

async function pintar(el) {
  const { sesion } = getEstado();
  const [solicitudes, subsecretarias, comisiones] = await Promise.all([
    fetchSolicitudes(), fetchSubsecretarias(), fetchComisiones(),
  ]);

  const mias = solicitudes.filter((s) => s.solicitante_cargo_id === sesion.cargo.id);
  const paraAtender = solicitudes.filter((s) => s.solicitante_cargo_id !== sesion.cargo.id);
  const puedeDirigir = puedeGestionarRamas(sesion);

  el.innerHTML = `
    <form class="formulario" data-form>
      <label class="campo"><span>Título</span><input name="titulo" required placeholder="¿Qué necesitas?" /></label>
      <label class="campo"><span>Descripción (opcional)</span><textarea name="descripcion" rows="2"></textarea></label>
      ${puedeDirigir ? `
        <label class="campo" style="flex-direction:row;align-items:center;gap:0.5em">
          <input type="checkbox" data-dirigir style="min-height:auto;width:auto" />
          <span>Dirigir a otra subsecretaría o comisión (en vez de escalar mi propia cadena)</span>
        </label>
        <div class="formulario__fila" data-catalogo hidden>
          <label class="campo"><span>División</span><select data-division>${opcionesSelect(DIVISIONES, { valor: 'v', etiqueta: 't' })}</select></label>
          <label class="campo" data-campo-subsecretaria><span>Subsecretaría</span><select name="destinatario_subsecretaria_id"></select></label>
          <label class="campo" data-campo-comision hidden><span>Comisión</span><select name="destinatario_comision_id">${opcionesSelect(comisiones, { valor: 'id', etiqueta: 'nombre', vacio: 'Elige una comisión' })}</select></label>
        </div>
      ` : ''}
      <button type="submit" class="boton boton--primario boton--ancho">${icono('mas', { tamano: 16 })} Pedir ayuda</button>
    </form>

    <h2 class="subtitulo">Para atender</h2>
    <div data-lista-atender></div>

    <h2 class="subtitulo">Mis solicitudes</h2>
    <div data-lista-mias></div>
  `;

  if (puedeDirigir) {
    const casilla = el.querySelector('[data-dirigir]');
    const bloqueCatalogo = el.querySelector('[data-catalogo]');
    const selectDivision = el.querySelector('[data-division]');
    const campoSubsecretaria = el.querySelector('[data-campo-subsecretaria]');
    const campoComision = el.querySelector('[data-campo-comision]');
    const selectSubsecretariaId = el.querySelector('[name="destinatario_subsecretaria_id"]');

    function actualizarCatalogo() {
      const division = selectDivision.value;
      campoComision.hidden = division !== 'sga';
      campoSubsecretaria.hidden = division === 'sga';
      selectSubsecretariaId.innerHTML = opcionesSelect(
        subsecretarias.filter((s) => s.division === division),
        { valor: 'id', etiqueta: 'nombre', vacio: 'Elige una subsecretaría' },
      );
    }
    casilla.addEventListener('change', () => { bloqueCatalogo.hidden = !casilla.checked; });
    selectDivision.addEventListener('change', actualizarCatalogo);
    actualizarCatalogo();
  }

  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    const dirigida = puedeDirigir && el.querySelector('[data-dirigir]')?.checked;
    const fila = {
      solicitante_cargo_id: sesion.cargo.id,
      titulo: datos.titulo,
      descripcion: datos.descripcion,
      destinatario_subsecretaria_id: dirigida ? (datos.destinatario_subsecretaria_id || null) : null,
      destinatario_comision_id: dirigida ? (datos.destinatario_comision_id || null) : null,
    };
    const { error } = await supabase.from('solicitudes_ayuda').insert(fila);
    if (error) { mostrarAviso(mensajeError(error), 'error'); return; }
    mostrarAviso('Solicitud enviada.', 'exito');
    e.target.reset();
    await pintar(el);
  });

  pintarPara(el.querySelector('[data-lista-atender]'), paraAtender, true, () => pintar(el));
  pintarPara(el.querySelector('[data-lista-mias]'), mias, false, () => pintar(el));
}

export async function render(el) {
  contenedor = el;
  el.innerHTML = `<div class="vista-cabecera"><h1>Solicitudes de ayuda</h1></div><div data-cuerpo>${esqueletoTabla()}</div>`;
  await pintar(el.querySelector('[data-cuerpo]'));
}

export function destroy() {
  contenedor = null;
}
