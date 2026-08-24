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

// Espejo optimista de puede_gestionar_rama() (ver 0033_grupos_trabajo.sql)
// — oculta el formulario de crear/editar grupos de trabajo a quien de
// todos modos RLS va a rechazar (coordinador/voluntario). La regla real
// vive en la base: solo super_admin o un cargo tipo='subsecretario'
// dentro de la propia rama puede escribir.
export function puedeGestionarRamas(sesion) {
  if (!sesion) return false;
  return sesion.esSuperAdmin || ['sg', 'sga', 'sgl', 'subsecretario'].includes(sesion.cargo.tipo);
}

// Bloque A — igual que puedeGestionarRamas pero para UN grupo concreto, no
// "alguna rama": sg/sga/sgl siempre (están por encima de toda subsecretaría/
// comisión), un subsecretario solo si el grupo es de su propia rama. Espejo
// de puede_gestionar_rama(g.subsecretaria_id, g.comision_id) — decide tanto
// si se ve el botón "Crear tarea" de un grupo como si se ve el formulario de
// creación de grupos_trabajo.js por fila.
export function puedeGestionarEsteGrupo(sesion, grupo) {
  if (!sesion) return false;
  if (sesion.esSuperAdmin || ['sg', 'sga', 'sgl'].includes(sesion.cargo.tipo)) return true;
  if (sesion.cargo.tipo !== 'subsecretario') return false;
  return sesion.cargo.subsecretaria_id === grupo.subsecretaria_id
    && sesion.cargo.comision_id === grupo.comision_id;
}

// Bloque A — toma/liberación voluntaria. Espejo de la rama nueva de
// tareas_update (0035): mi cargo es miembro del grupo destinatario, y la
// tarea está sin responsable (para tomarla) o el responsable soy yo mismo
// (para liberarla). fn_toma_voluntaria_tarea es quien de verdad decide.
export function puedeTomarTarea(sesion, tarea) {
  if (!sesion || !tarea.grupo_trabajo_id) return false;
  if (sesion.cargo.grupo_trabajo_id !== tarea.grupo_trabajo_id) return false;
  return tarea.responsable_cargo_id === null || tarea.responsable_cargo_id === sesion.cargo.id;
}
