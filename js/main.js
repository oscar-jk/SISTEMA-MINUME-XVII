import { iniciar, iniciarSesion, cerrarSesion } from './core/sesion.js';
import { getEstado, subscribe } from './core/store.js';
import { definirRuta, iniciarRouter, navegar } from './core/router.js';
import './core/cola.js';
import { icono } from './ui/icono.js';
import { mensajeError } from './ui/aviso.js';
import { puedeAsignar, esAdmin } from './core/permisos.js';

const ENLACES_NAV = [
  { href: '#/mis-tareas', texto: 'Mis tareas', iconoNombre: 'check-circulo' },
  { href: '#/calendario', texto: 'Calendario', iconoNombre: 'calendario' },
  { href: '#/bandeja', texto: 'Bandeja', iconoNombre: 'bandeja', requiere: 'asignar' },
  { href: '#/admin', texto: 'Admin', iconoNombre: 'admin', requiere: 'admin' },
];

definirRuta('calendario', () => import('./modules/calendario.js'));
definirRuta('actividad/:id', () => import('./modules/actividad.js'));
definirRuta('mis-tareas', () => import('./modules/tareas.js'));
definirRuta('tarea/:id', () => import('./modules/tarea.js'));
definirRuta('bandeja', () => import('./modules/bandeja.js'));
definirRuta('admin', () => import('./modules/admin.js'));

function enlacesVisibles(sesion) {
  return ENLACES_NAV.filter((e) => {
    if (e.requiere === 'asignar') return puedeAsignar(sesion);
    if (e.requiere === 'admin') return esAdmin(sesion);
    return true;
  });
}

function pintarNav() {
  const { sesion } = getEstado();
  const enlaces = enlacesVisibles(sesion);
  const html = (destino) => enlaces.map((e) => `
    <a href="${e.href}" class="${destino === 'movil' ? 'app-nav-movil__enlace' : 'app-nav__enlace'}${location.hash === e.href ? ' activo' : ''}">
      ${icono(e.iconoNombre, { tamano: destino === 'movil' ? 22 : 18 })}
      <span>${e.texto}</span>
    </a>`).join('');

  document.getElementById('app-nav').innerHTML = html('escritorio');
  document.getElementById('app-nav-movil').innerHTML = html('movil');
}

function pintarBannerConexion() {
  const { enLinea, pendientesCola } = getEstado();
  const banner = document.getElementById('banner-conexion');
  if (enLinea && pendientesCola === 0) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.textContent = !enLinea
    ? `Sin conexión — ${pendientesCola} avance${pendientesCola === 1 ? '' : 's'} pendiente${pendientesCola === 1 ? '' : 's'} de enviar`
    : `Sincronizando ${pendientesCola} avance${pendientesCola === 1 ? '' : 's'}…`;
}

function pintarUsuario() {
  const { sesion } = getEstado();
  document.getElementById('app-usuario-nombre').textContent = sesion
    ? `${sesion.persona.nombre} · ${sesion.cargo.nombre}`
    : '';
}

async function aplicarSesion() {
  const { sesion, cargando, errorSesion } = getEstado();
  const login = document.getElementById('pantalla-login');
  const shell = document.getElementById('app-shell');

  if (cargando) {
    login.hidden = true;
    shell.hidden = true;
    return;
  }

  if (!sesion) {
    login.hidden = false;
    shell.hidden = true;
    const errorEl = document.getElementById('login-error');
    if (errorSesion) {
      errorEl.textContent = errorSesion;
      errorEl.hidden = false;
    }
    return;
  }

  login.hidden = true;
  shell.hidden = false;
  pintarNav();
  pintarUsuario();

  if (!window.__minumeRouterIniciado) {
    window.__minumeRouterIniciado = true;
    iniciarRouter(document.getElementById('app'));
    window.addEventListener('minume:ruta-cambiada', pintarNav);
  }
}

function iniciarFormularioLogin() {
  const form = document.getElementById('form-login');
  const errorEl = document.getElementById('login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const datos = new FormData(form);
      await iniciarSesion(datos.get('correo'), datos.get('codigo'));
    } catch (err) {
      errorEl.textContent = mensajeError(err);
      errorEl.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });
}

function iniciarBotonSalir() {
  const boton = document.getElementById('boton-salir');
  boton.innerHTML = icono('salir', { tamano: 18 });
  boton.addEventListener('click', async () => {
    await cerrarSesion();
    navegar('#/mis-tareas');
  });
}

async function main() {
  iniciarFormularioLogin();
  iniciarBotonSalir();
  subscribe(() => {
    aplicarSesion();
    pintarBannerConexion();
  });
  await iniciar();
}

main();
