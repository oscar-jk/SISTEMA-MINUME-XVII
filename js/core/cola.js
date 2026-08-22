// Cola de avances pendientes de enviar. Los voluntarios reportan desde el
// teléfono, muchas veces con red saturada: un avance nunca debe perderse
// por un fallo de conexión momentáneo. Se guarda en localStorage primero,
// se intenta enviar de inmediato, y se reintenta con backoff cuando vuelve
// la red o cuando algo más dispara flush().
import { supabase } from './supabase.js';
import { set, getEstado } from './store.js';

const CLAVE = 'minume_cola_avances';
let enviando = false;
let reintentoMs = 3000;
const REINTENTO_MAX_MS = 60000;

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || '[]');
  } catch {
    return [];
  }
}

function escribir(lista) {
  localStorage.setItem(CLAVE, JSON.stringify(lista));
  set({ pendientesCola: lista.length });
}

export function pendientes() {
  return leer();
}

export function encolarAvance(payload) {
  const lista = leer();
  const item = { ...payload, _localId: crypto.randomUUID(), _creadoEn: Date.now() };
  lista.push(item);
  escribir(lista);
  flush();
  return item;
}

export async function flush() {
  if (enviando || !navigator.onLine) return;
  const lista = leer();
  if (lista.length === 0) return;

  enviando = true;
  const restantes = [];
  let huboExito = false;

  for (const item of lista) {
    const { _localId, _creadoEn, ...payload } = item;
    const { error } = await supabase.from('avances_tarea').insert(payload);
    if (error) {
      console.warn('No se pudo enviar un avance de la cola, se reintentará:', error.message);
      restantes.push(item);
    } else {
      huboExito = true;
    }
  }

  escribir(restantes);
  enviando = false;

  if (restantes.length > 0) {
    reintentoMs = Math.min(reintentoMs * 2, REINTENTO_MAX_MS);
    setTimeout(flush, reintentoMs);
  } else {
    reintentoMs = 3000;
  }

  if (huboExito) {
    window.dispatchEvent(new CustomEvent('minume:avance-sincronizado'));
  }
}

window.addEventListener('online', () => {
  set({ enLinea: true });
  reintentoMs = 3000;
  flush();
});
window.addEventListener('offline', () => set({ enLinea: false }));

set({ pendientesCola: leer().length, enLinea: navigator.onLine });
flush();
