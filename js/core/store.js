// Estado central con suscriptores. Nada mágico: un objeto, un set() que
// notifica, y un subscribe() que devuelve cómo darse de baja.

const estado = {
  sesion: null,        // { user, persona, cargo, esSuperAdmin } | null
  cargando: true,       // true mientras se resuelve la sesión inicial
  pendientesCola: 0,     // avances encolados sin enviar (ver core/cola.js)
  enLinea: navigator.onLine,
};

const subscriptores = new Set();

export function getEstado() {
  return estado;
}

export function set(parcial) {
  Object.assign(estado, parcial);
  for (const fn of subscriptores) fn(estado);
}

export function subscribe(fn) {
  subscriptores.add(fn);
  return () => subscriptores.delete(fn);
}
