export const ESTADO_TAREA_LABEL = {
  no_iniciada: 'No iniciada',
  en_curso: 'En curso',
  en_revision: 'En revisión',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_aplica: 'No aplica',
};

export const ESTADO_ACTIVIDAD_LABEL = {
  no_iniciada: 'No iniciada',
  en_preparacion: 'En preparación',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_aplica: 'No aplica',
};

export const PRIORIDAD_LABEL = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

export function claseEstadoTarea(estado) {
  return `estado estado--${estado.replace(/_/g, '-')}`;
}

export function claseEstadoActividad(estado) {
  return `estado estado--${estado.replace(/_/g, '-')}`;
}

export function clasePrioridad(prioridad) {
  return `prioridad prioridad--${prioridad}`;
}

export function esPrioridadAlta(prioridad) {
  return prioridad === 'alta' || prioridad === 'critica';
}

export function iniciales(nombre, apellido) {
  const a = (nombre || '?').trim()[0] || '?';
  const b = (apellido || '').trim()[0] || '';
  return (a + b).toUpperCase();
}

export function nombreCompleto(persona) {
  if (!persona) return 'Sin asignar';
  return `${persona.nombre} ${persona.apellido}`.trim();
}

export function escapeHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
