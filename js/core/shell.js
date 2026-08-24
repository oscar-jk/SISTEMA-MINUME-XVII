// Chrome compartido entre todas las páginas autenticadas: barra lateral,
// barra superior e inferior móviles, banner de conexión y compuerta de
// sesión. Cada página solo declara los placeholders vacíos (#app-sidebar,
// #app-topbar-movil, #app-nav-inferior, #app-drawer-fondo,
// #banner-conexion) y llama a montarShell() antes de pintar lo suyo.
//
// Un solo árbol de navegación en el DOM: pintarNav() construye #app-sidebar
// una sola vez y CSS lo reposiciona según el viewport (columna fija en
// escritorio, panel fuera-de-lienzo deslizable en móvil). La barra inferior
// móvil (#app-nav-inferior) es un pintado aparte y deliberadamente distinto
// — no es una segunda copia del árbol, es un subconjunto curado de destinos
// frecuentes (ver enBarraInferior más abajo).
import { iniciar, cerrarSesion, cambiarCargoActivo } from './sesion.js';
import { getEstado, subscribe } from './store.js';
import './cola.js';
import { icono } from '../ui/icono.js';
import { puedeAsignar, esAdmin } from './permisos.js';
import { escapeHtml } from '../utils/formato.js';
import { mostrarAviso, mensajeError } from '../ui/aviso.js';

const CLAVE_COLAPSADO = 'minume_sidebar_colapsado';

// Un solo punto de verdad para la navegación — fusiona lo que antes eran
// ENLACES_NAV y ENLACES_ADMIN. Nuevos destinos se agregan aquí, agrupados
// por `grupo` ('operativo' | 'organizacional' | 'admin'). `enBarraInferior`
// marca los destinos que además aparecen en la barra inferior móvil.
const ENLACES_NAV = [
  { grupo: 'operativo', href: '/tablero.html', texto: 'Tablero', iconoNombre: 'tablero', enBarraInferior: true },
  { grupo: 'operativo', href: '/mis-tareas.html', texto: 'Mis tareas', iconoNombre: 'check-circulo', enBarraInferior: true },
  { grupo: 'operativo', href: '/checklist.html', texto: 'Checklist', iconoNombre: 'check' },
  { grupo: 'operativo', href: '/calendario.html', texto: 'Calendario', iconoNombre: 'calendario', enBarraInferior: true },
  { grupo: 'operativo', href: '/bandeja.html', texto: 'Bandeja', iconoNombre: 'bandeja', requiere: 'asignar' },
  { grupo: 'operativo', href: '/solicitudes-ayuda.html', texto: 'Solicitudes de ayuda', iconoNombre: 'alerta' },
  { grupo: 'operativo', href: '/evaluaciones.html', texto: 'Evaluaciones', iconoNombre: 'estrella' },
  { grupo: 'organizacional', href: '/organigrama.html', texto: 'Organigrama', iconoNombre: 'organigrama' },
  { grupo: 'organizacional', href: '/espacios.html', texto: 'Espacios', iconoNombre: 'edificio' },
  { grupo: 'organizacional', href: '/asistencia.html', texto: 'Asistencia', iconoNombre: 'reloj', enBarraInferior: true },
  { grupo: 'organizacional', href: '/grupos-trabajo.html', texto: 'Grupos de trabajo', iconoNombre: 'organigrama', requiere: 'asignar' },
  { grupo: 'operativo', href: '/verificar.html', texto: 'Verificar', iconoNombre: 'escanear', requiere: 'asignar', enBarraInferior: true },
  { grupo: 'admin', href: '/admin-personas.html', texto: 'Personas y cargos', iconoNombre: 'usuario', requiere: 'asignar' },
  { grupo: 'admin', href: '/admin-desarrollador.html', texto: 'Panel de desarrollador', iconoNombre: 'estrella', requiere: 'admin' },
  { grupo: 'admin', href: '/admin-cuentas.html', texto: 'Cuentas', iconoNombre: 'cadena', requiere: 'admin' },
  { grupo: 'admin', href: '/admin-catalogos.html', texto: 'Catálogos', iconoNombre: 'filtro', requiere: 'admin' },
  { grupo: 'admin', href: '/admin-configuracion.html', texto: 'Configuración', iconoNombre: 'admin', requiere: 'admin' },
  { grupo: 'admin', href: '/admin-acreditacion.html', texto: 'Acreditación', iconoNombre: 'adjunto', requiere: 'asignar' },
  { grupo: 'admin', href: '/bitacora.html', texto: 'Bitácora', iconoNombre: 'reintentar', requiere: 'admin' },
];

const TITULO_GRUPO = {
  operativo: 'Operativo',
  organizacional: 'Organización',
  admin: 'Administración',
};

function enlacesVisibles(sesion) {
  return ENLACES_NAV.filter((e) => {
    if (e.requiere === 'asignar') return puedeAsignar(sesion);
    if (e.requiere === 'admin') return esAdmin(sesion);
    return true;
  });
}

function sidebarColapsado() {
  return localStorage.getItem(CLAVE_COLAPSADO) === '1';
}

function fijarColapsado(colapsado) {
  localStorage.setItem(CLAVE_COLAPSADO, colapsado ? '1' : '0');
  const shell = document.querySelector('.app-shell');
  if (shell) shell.classList.toggle('app-shell--colapsado', colapsado);
  const boton = document.getElementById('boton-colapsar');
  if (boton) boton.setAttribute('aria-expanded', String(!colapsado));
}

function enlaceHtml(e, activo) {
  return `
    <a href="${e.href}" class="sidebar__enlace${activo ? ' activo' : ''}" title="${escapeHtml(e.texto)}">
      ${icono(e.iconoNombre, { tamano: 20 })}
      <span class="sidebar__enlace-texto">${escapeHtml(e.texto)}</span>
    </a>`;
}

function grupoHtml(grupo, enlaces) {
  const items = enlaces.filter((e) => e.grupo === grupo);
  if (items.length === 0) return '';
  const html = items.map((e) => enlaceHtml(e, location.pathname === e.href)).join('');

  if (grupo === 'admin') {
    const abiertoPorRuta = items.some((e) => e.href === location.pathname);
    return `
      <div class="sidebar__grupo sidebar__grupo--admin">
        <button type="button" class="sidebar__grupo-cabecera" aria-expanded="${abiertoPorRuta}" aria-controls="sidebar-grupo-admin">
          <span class="sidebar__grupo-titulo">${TITULO_GRUPO.admin}</span>
          ${icono('flecha-der', { tamano: 14, clase: 'sidebar__grupo-flecha' })}
        </button>
        <div id="sidebar-grupo-admin" class="sidebar__grupo-items"${abiertoPorRuta ? '' : ' hidden'}>${html}</div>
      </div>`;
  }

  return `
    <div class="sidebar__grupo">
      <span class="sidebar__grupo-titulo">${TITULO_GRUPO[grupo]}</span>
      ${html}
    </div>`;
}

function piePintar(sesion) {
  const tieneVariosCargos = sesion.cargos && sesion.cargos.length > 1;
  const usuarioHtml = tieneVariosCargos
    ? `<select id="selector-cargo" class="selector-cargo" title="Cambiar de cargo activo">
        ${sesion.cargos.map((c) => `<option value="${c.id}"${c.id === sesion.cargo.id ? ' selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
      </select>`
    : `<span class="sidebar__pie-texto">${escapeHtml(sesion.persona.nombre)} · ${escapeHtml(sesion.cargo.nombre)}</span>`;

  return `
    <div class="sidebar__pie">
      ${usuarioHtml}
      <button id="boton-salir" type="button" class="boton-icono" title="Cerrar sesión">${icono('salir', { tamano: 18 })}</button>
    </div>`;
}

function pintarNav(sesion) {
  const enlaces = enlacesVisibles(sesion);
  const colapsado = sidebarColapsado();

  const sidebar = document.getElementById('app-sidebar');
  sidebar.innerHTML = `
    <div class="sidebar__marca-fila">
      <a href="/tablero.html" class="sidebar__marca">SIRIO <span>XVII</span></a>
      <button type="button" id="boton-colapsar" class="boton-icono sidebar__colapsar" title="Colapsar barra lateral" aria-expanded="${!colapsado}">
        ${icono('flecha-izq', { tamano: 16 })}
      </button>
    </div>
    <div class="sidebar__grupos">
      ${grupoHtml('operativo', enlaces)}
      ${grupoHtml('organizacional', enlaces)}
      ${grupoHtml('admin', enlaces)}
    </div>
    ${piePintar(sesion)}
  `;

  const shell = document.querySelector('.app-shell');
  if (shell) shell.classList.toggle('app-shell--colapsado', colapsado);

  sidebar.querySelector('#boton-colapsar').addEventListener('click', () => {
    fijarColapsado(!sidebarColapsado());
  });

  const cabeceraAdmin = sidebar.querySelector('.sidebar__grupo-cabecera');
  if (cabeceraAdmin) {
    cabeceraAdmin.addEventListener('click', () => {
      const items = sidebar.querySelector('.sidebar__grupo-items');
      const abierto = cabeceraAdmin.getAttribute('aria-expanded') === 'true';
      cabeceraAdmin.setAttribute('aria-expanded', String(!abierto));
      items.hidden = abierto;
    });
  }

  sidebar.querySelector('#boton-salir').addEventListener('click', async () => {
    await cerrarSesion();
    location.href = '/index.html';
  });

  const selectorCargo = sidebar.querySelector('#selector-cargo');
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

  pintarNavInferior(enlaces);
  pintarTopbarMovil();
}

// Barra inferior móvil: subconjunto curado (enBarraInferior), no una copia
// del árbol completo — se pinta aparte a propósito.
function pintarNavInferior(enlaces) {
  const destinos = enlaces.filter((e) => e.enBarraInferior);
  const navInferior = document.getElementById('app-nav-inferior');
  navInferior.innerHTML = destinos.map((e) => `
    <a href="${e.href}" class="app-nav-inferior__enlace${location.pathname === e.href ? ' activo' : ''}">
      ${icono(e.iconoNombre, { tamano: 22 })}
      <span>${escapeHtml(e.texto)}</span>
    </a>`).join('');
}

function cerrarDrawer() {
  document.getElementById('app-sidebar').classList.remove('app-sidebar--abierto');
  document.getElementById('app-drawer-fondo').hidden = true;
  const boton = document.getElementById('boton-abrir-menu');
  if (boton) {
    boton.setAttribute('aria-expanded', 'false');
    boton.innerHTML = icono('menu', { tamano: 22 });
  }
}

function abrirDrawer() {
  document.getElementById('app-sidebar').classList.add('app-sidebar--abierto');
  document.getElementById('app-drawer-fondo').hidden = false;
  const boton = document.getElementById('boton-abrir-menu');
  if (boton) {
    boton.setAttribute('aria-expanded', 'true');
    boton.innerHTML = icono('cerrar', { tamano: 22 });
  }
}

function pintarTopbarMovil() {
  const topbar = document.getElementById('app-topbar-movil');
  if (topbar.dataset.montado) return; // solo se pinta una vez; pintarNav() puede correr varias veces por sesión
  topbar.dataset.montado = '1';
  topbar.innerHTML = `
    <button type="button" id="boton-abrir-menu" class="boton-icono" aria-label="Abrir menú" aria-expanded="false" aria-controls="app-sidebar">
      ${icono('menu', { tamano: 22 })}
    </button>
    <a href="/tablero.html" class="app-topbar-movil__marca">SIRIO <span>XVII</span></a>
  `;

  const fondo = document.getElementById('app-drawer-fondo');
  topbar.querySelector('#boton-abrir-menu').addEventListener('click', () => {
    const abierto = document.getElementById('app-sidebar').classList.contains('app-sidebar--abierto');
    if (abierto) cerrarDrawer(); else abrirDrawer();
  });
  fondo.addEventListener('click', cerrarDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarDrawer();
  });
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
