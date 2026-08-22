// Chrome compartido entre todas las páginas autenticadas: header, nav de
// escritorio, nav móvil, banner de conexión y compuerta de sesión. Cada
// página solo declara los placeholders vacíos (#app-header, #app-nav-movil,
// #banner-conexion) y llama a montarShell() antes de pintar lo suyo.
import { iniciar, cerrarSesion, cambiarCargoActivo } from './sesion.js';
import { getEstado, subscribe } from './store.js';
import './cola.js';
import { icono } from '../ui/icono.js';
import { puedeAsignar, esAdmin } from './permisos.js';
import { escapeHtml } from '../utils/formato.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';

// Un solo punto de verdad para la navegación. Nuevas páginas se agregan
// aquí, no se duplican a mano en cada .html. Con 11 destinos, el header y
// el nav móvil solo muestran los principales — el resto (todo lo de
// administración) cuelga de un único enlace "Admin" y su propia
// sub-navegación en cada página admin-*.html (ver pintarSubnavAdmin()).
const ENLACES_NAV = [
  { href: '/tablero.html', texto: 'Tablero', iconoNombre: 'tablero' },
  { href: '/mis-tareas.html', texto: 'Mis tareas', iconoNombre: 'check-circulo' },
  { href: '/checklist.html', texto: 'Checklist', iconoNombre: 'check' },
  { href: '/calendario.html', texto: 'Calendario', iconoNombre: 'calendario' },
  { href: '/bandeja.html', texto: 'Bandeja', iconoNombre: 'bandeja', requiere: 'asignar' },
  { href: '/organigrama.html', texto: 'Organigrama', iconoNombre: 'organigrama' },
  { href: '/espacios.html', texto: 'Espacios', iconoNombre: 'edificio' },
  { href: '/asistencia.html', texto: 'Asistencia', iconoNombre: 'reloj' },
  { href: '/admin-personas.html', texto: 'Admin', iconoNombre: 'admin', requiere: 'asignar' },
];

// Enlaces de administración, agrupados aparte de ENLACES_NAV para no
// saturar el header/nav móvil. Cada página admin-*.html pinta este grupo
// como su propia sub-navegación (pintarSubnavAdmin).
export const ENLACES_ADMIN = [
  { href: '/admin-personas.html', texto: 'Personas y cargos', requiere: 'asignar' },
  { href: '/admin-cuentas.html', texto: 'Cuentas', requiere: 'admin' },
  { href: '/admin-catalogos.html', texto: 'Catálogos', requiere: 'admin' },
  { href: '/admin-configuracion.html', texto: 'Configuración', requiere: 'admin' },
  { href: '/bitacora.html', texto: 'Bitácora', requiere: 'admin' },
];

export function pintarSubnavAdmin(el, sesion) {
  const enlaces = ENLACES_ADMIN.filter((e) => (e.requiere === 'admin' ? esAdmin(sesion) : puedeAsignar(sesion)));
  el.className = 'filtros-chip';
  el.innerHTML = enlaces.map((e) => `
    <a href="${e.href}" class="chip${location.pathname === e.href ? ' chip--activo' : ''}" style="text-decoration:none">${e.texto}</a>
  `).join('');
}

function enlacesVisibles(sesion) {
  return ENLACES_NAV.filter((e) => {
    if (e.requiere === 'asignar') return puedeAsignar(sesion);
    if (e.requiere === 'admin') return esAdmin(sesion);
    return true;
  });
}

function pintarNav(sesion) {
  const enlaces = enlacesVisibles(sesion);
  const html = (destino) => enlaces.map((e) => `
    <a href="${e.href}" class="${destino === 'movil' ? 'app-nav-movil__enlace' : 'app-nav__enlace'}${location.pathname === e.href ? ' activo' : ''}">
      ${icono(e.iconoNombre, { tamano: destino === 'movil' ? 22 : 18 })}
      <span>${e.texto}</span>
    </a>`).join('');

  // El conmutador de cargo solo aparece para quien ocupa más de uno a la
  // vez (ver 0023_cargo_activo.sql) — la inmensa mayoría solo tiene uno y
  // no ve ningún cambio en el header.
  const tieneVariosCargos = sesion.cargos && sesion.cargos.length > 1;
  const usuarioHtml = tieneVariosCargos
    ? `<select id="selector-cargo" class="selector-cargo" title="Cambiar de cargo activo">
        ${sesion.cargos.map((c) => `<option value="${c.id}"${c.id === sesion.cargo.id ? ' selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
      </select>`
    : `<span>${escapeHtml(sesion.persona.nombre)} · ${escapeHtml(sesion.cargo.nombre)}</span>`;

  const header = document.getElementById('app-header');
  header.innerHTML = `
    <div class="app-header__marca">SIRIO <span>XVII</span></div>
    <nav class="app-nav">${html('escritorio')}</nav>
    <div class="app-header__usuario">
      ${usuarioHtml}
      <button id="boton-salir" type="button" class="boton-icono" title="Cerrar sesión">${icono('salir', { tamano: 18 })}</button>
    </div>
  `;
  document.getElementById('app-nav-movil').innerHTML = html('movil');

  header.querySelector('#boton-salir').addEventListener('click', async () => {
    await cerrarSesion();
    location.href = '/index.html';
  });

  const selectorCargo = header.querySelector('#selector-cargo');
  if (selectorCargo) {
    selectorCargo.addEventListener('change', async () => {
      const elegido = selectorCargo.value;
      selectorCargo.disabled = true;
      try {
        await cambiarCargoActivo(elegido);
        mostrarAviso('Cargo activo cambiado.', 'exito');
      } catch (err) {
        mostrarAviso(mensajeError(err), 'error');
        selectorCargo.disabled = false;
      }
    });
  }
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

// Resuelve cuando hay sesión y cargo listos, o redirige a /index.html si no
// hay sesión. La página que llama espera esta promesa antes de pedir datos.
export function montarShell() {
  return new Promise((resolve) => {
    let resuelto = false;
    subscribe(() => {
      const { sesion, cargando } = getEstado();
      pintarBannerConexion();

      if (cargando) return;

      if (!sesion) {
        location.href = '/index.html';
        return;
      }

      pintarNav(sesion);
      if (!resuelto) {
        resuelto = true;
        resolve(sesion);
      }
    });
    iniciar();
  });
}
