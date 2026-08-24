// Cuentas de acceso. Sin autoservicio de registro: se crean aquí con
// correo y código de acceso. Crear, restablecer y activar/desactivar pasan
// por Edge Functions — son las únicas piezas que tocan la clave de
// servicio de Supabase, nunca el navegador directamente.
import { supabase } from '../core/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';
import { datosFormulario, opcionesSelect } from '../ui/formulario.js';
import { crearTabla } from '../ui/tabla.js';
import { esqueletoTabla } from '../ui/esqueleto.js';
import { abrirModal } from '../ui/modal.js';
import { nombreCompleto } from '../utils/formato.js';

async function llamarFuncion(nombre, cuerpo) {
  const { data: { session } } = await supabase.auth.getSession();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(cuerpo),
  });
  const resultado = await resp.json();
  if (!resp.ok) throw new Error(resultado.error || 'No se pudo completar la operación.');
  return resultado;
}

async function fetchPersonasSinCuenta() {
  const { data } = await supabase
    .from('personas')
    .select('id, nombre, apellido, correo, usuarios(id)');
  return (data || []).filter((p) => !p.usuarios || p.usuarios.length === 0);
}

async function fetchCuentas() {
  const { data } = await supabase
    .from('usuarios')
    .select('id, activa, es_super_admin, persona:personas(nombre, apellido, correo)')
    .order('activa', { ascending: false });
  return data || [];
}

function abrirModalReset(cuenta, alTerminar) {
  const div = document.createElement('div');
  div.innerHTML = `
    <p class="texto-mudo">Nuevo código de acceso para <strong>${nombreCompleto(cuenta.persona)}</strong>.</p>
    <form class="formulario" data-form-reset>
      <label class="campo"><span>Código de acceso nuevo (mínimo 8 caracteres)</span><input name="codigo_acceso" type="text" minlength="8" required /></label>
      <button type="submit" class="boton boton--primario boton--ancho">Restablecer</button>
    </form>
  `;
  const { cerrar } = abrirModal({ titulo: 'Restablecer contraseña', contenido: div, ancho: 'angosto' });
  div.querySelector('[data-form-reset]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    try {
      await llamarFuncion('restablecer-contrasena', { usuario_id: cuenta.id, codigo_acceso: datos.codigo_acceso });
      mostrarAviso('Código de acceso restablecido. Compártelo por un canal seguro.', 'exito');
      cerrar();
      alTerminar();
    } catch (err) {
      mostrarAviso(mensajeError(err), 'error');
    }
  });
}

async function alternarCuenta(cuenta, activar, alTerminar) {
  try {
    await llamarFuncion('alternar-cuenta', { usuario_id: cuenta.id, activar });
    mostrarAviso(activar ? 'Cuenta reactivada.' : 'Cuenta desactivada. El historial se conserva.', 'exito');
    alTerminar();
  } catch (err) {
    mostrarAviso(mensajeError(err), 'error');
  }
}

async function pintar(el) {
  const [personas, cuentas] = await Promise.all([fetchPersonasSinCuenta(), fetchCuentas()]);

  el.innerHTML = `
    <p class="texto-mudo">Sin autoservicio de registro: las cuentas se crean aquí con correo y código de acceso.</p>
    <form class="formulario" data-form-cuenta>
      <label class="campo">
        <span>Persona</span>
        <select name="persona_id" required>${opcionesSelect(personas, { valor: 'id', etiqueta: nombreCompleto, vacio: 'Elige una persona sin cuenta' })}</select>
      </label>
      <label class="campo"><span>Correo de acceso</span><input name="correo" type="email" required /></label>
      <label class="campo"><span>Código de acceso (mínimo 8 caracteres)</span><input name="codigo_acceso" type="text" minlength="8" required /></label>
      <button type="submit" class="boton boton--primario boton--ancho">Crear cuenta</button>
    </form>
    <h2 class="subtitulo">Cuentas existentes</h2>
    <div data-tabla-cuentas></div>
  `;

  el.querySelector('[data-form-cuenta]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(e.target);
    try {
      await llamarFuncion('crear-cuenta', datos);
      mostrarAviso('Cuenta creada. Comparte el correo y el código de acceso por un canal seguro.', 'exito');
      await pintar(el);
    } catch (err) {
      mostrarAviso(mensajeError(err), 'error');
    }
  });

  const tabla = crearTabla([
    { clave: 'persona', titulo: 'Persona', render: (c) => nombreCompleto(c.persona), ordenarPor: (c) => nombreCompleto(c.persona) },
    { clave: 'correo', titulo: 'Correo', render: (c) => c.persona?.correo ?? '—', ordenarPor: (c) => c.persona?.correo || '' },
    { clave: 'activa', titulo: 'Estado', render: (c) => (c.activa ? 'Activa' : 'Desactivada') },
  ], cuentas);

  tabla.querySelectorAll('tbody tr').forEach((tr, i) => {
    const cuenta = cuentas[i];
    if (!cuenta) return;
    const td = document.createElement('td');
    td.className = 'tabla__acciones';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'boton boton--fantasma boton--pequeno';
    resetBtn.textContent = 'Restablecer código';
    resetBtn.addEventListener('click', () => abrirModalReset(cuenta, () => pintar(el)));
    td.appendChild(resetBtn);

    if (!cuenta.es_super_admin) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'boton boton--secundario boton--pequeno';
      toggleBtn.textContent = cuenta.activa ? 'Desactivar' : 'Reactivar';
      toggleBtn.addEventListener('click', () => alternarCuenta(cuenta, !cuenta.activa, () => pintar(el)));
      td.appendChild(toggleBtn);
    }

    tr.appendChild(td);
  });

  el.querySelector('[data-tabla-cuentas]').replaceChildren(tabla);
}

export async function render(el) {
  el.innerHTML = `<div class="vista-cabecera"><h1>Cuentas</h1></div><div data-cuerpo>${esqueletoTabla()}</div>`;
  await pintar(el.querySelector('[data-cuerpo]'));
}

export function destroy() {}
