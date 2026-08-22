// Solo para ocultar botones y mejorar la experiencia. Ninguna regla de
// acceso real depende de este archivo: toda escritura la valida la base de
// datos (RLS + triggers, ver /supabase/migrations). Si algo aquí deja pasar
// una acción que el backend rechaza, el usuario simplemente ve un error
// claro — no es una brecha de seguridad, es solo una UI optimista.

const ROLES_ASIGNAN = new Set([
  'super_admin', 'sg', 'sga', 'sgl', 'subsecretario', 'coordinador',
]);

export function puedeAsignar(sesion) {
  if (!sesion) return false;
  return sesion.esSuperAdmin || ROLES_ASIGNAN.has(sesion.cargo.tipo);
}

export function esResponsableDe(sesion, tarea) {
  return !!sesion && tarea.responsable_cargo_id === sesion.cargo.id;
}

export function esSupervisorDirecto(sesion, tarea) {
  return !!sesion && tarea.supervisor_cargo_id === sesion.cargo.id;
}

// Heurística amplia: el backend es quien decide de verdad si además de
// supervisor directo el usuario es un ascendiente en la cadena.
export function puedeAprobarODevolver(sesion, tarea) {
  if (!sesion) return false;
  return sesion.esSuperAdmin || esSupervisorDirecto(sesion, tarea) || puedeAsignar(sesion);
}

export function puedeRegistrarAvance(sesion, tarea) {
  return esResponsableDe(sesion, tarea)
    && !['completada', 'cancelada', 'no_aplica'].includes(tarea.estado);
}

export function puedeEnviarRevision(sesion, tarea) {
  return esResponsableDe(sesion, tarea) && tarea.estado === 'en_curso';
}

export function esAdmin(sesion) {
  return !!sesion && sesion.esSuperAdmin;
}
