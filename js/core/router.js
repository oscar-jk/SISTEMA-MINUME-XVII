// Enrutado por hash con módulos ES nativos. Cada módulo expone
// render(contenedor, params) y opcionalmente destroy().

const rutas = [];
let moduloActual = null;
let contenedor = null;

export function definirRuta(patron, cargarModulo) {
  const partes = patron.split('/').filter(Boolean);
  rutas.push({ partes, cargarModulo });
}

function emparejar(hash) {
  const limpio = hash.replace(/^#\/?/, '').split('?')[0];
  const segmentos = limpio.split('/').filter(Boolean);

  for (const ruta of rutas) {
    if (ruta.partes.length !== segmentos.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < ruta.partes.length; i++) {
      const parte = ruta.partes[i];
      if (parte.startsWith(':')) {
        params[parte.slice(1)] = decodeURIComponent(segmentos[i]);
      } else if (parte !== segmentos[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { ruta, params };
  }
  return null;
}

async function despachar() {
  const emparejada = emparejar(location.hash || '#/mis-tareas');
  if (!emparejada) {
    location.hash = '#/mis-tareas';
    return;
  }

  if (moduloActual && typeof moduloActual.destroy === 'function') {
    try { moduloActual.destroy(); } catch (err) { console.error(err); }
  }

  contenedor.innerHTML = '';
  contenedor.setAttribute('aria-busy', 'true');

  const modulo = await emparejada.ruta.cargarModulo();
  moduloActual = modulo;
  await modulo.render(contenedor, emparejada.params);

  contenedor.setAttribute('aria-busy', 'false');
  window.dispatchEvent(new CustomEvent('minume:ruta-cambiada', { detail: location.hash }));
}

export function iniciarRouter(elementoContenedor) {
  contenedor = elementoContenedor;
  window.addEventListener('hashchange', despachar);
  despachar();
}

export function navegar(hash) {
  if (location.hash === hash) {
    despachar();
  } else {
    location.hash = hash;
  }
}
