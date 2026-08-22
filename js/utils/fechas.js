// Utilidades de fecha en español dominicano. Se trabaja con 'YYYY-MM-DD'
// como texto siempre que sea posible, para no arrastrar problemas de huso
// horario entre el navegador y la columna `date` de Postgres.

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function aFechaLocal(iso) {
  // 'YYYY-MM-DD' -> Date en horario local, sin el corrimiento de parsear UTC.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatoCorto(iso) {
  if (!iso) return '—';
  const f = aFechaLocal(iso);
  return `${f.getDate()} ${MESES_CORTOS[f.getMonth()]}`;
}

export function formatoLargo(iso) {
  if (!iso) return '—';
  const f = aFechaLocal(iso);
  return `${DIAS_LARGOS[f.getDay()]}, ${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}`;
}

export function formatoHora(hhmmss) {
  if (!hhmmss) return '';
  const [h, m] = hhmmss.split(':').map(Number);
  const periodo = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`;
}

export function diasHasta(iso) {
  if (!iso) return null;
  const hoy = aFechaLocal(hoyISO());
  const objetivo = aFechaLocal(iso);
  return Math.round((objetivo - hoy) / 86400000);
}

export function estaVencida(tarea) {
  if (!tarea.fecha_limite) return false;
  if (['completada', 'cancelada', 'no_aplica'].includes(tarea.estado)) return false;
  return diasHasta(tarea.fecha_limite) < 0;
}

export function etiquetaPlazo(tarea) {
  if (!tarea.fecha_limite) return 'Sin plazo';
  const dias = diasHasta(tarea.fecha_limite);
  if (estaVencida(tarea)) {
    return dias === -1 ? 'Venció ayer' : `Vencida hace ${Math.abs(dias)} días`;
  }
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias > 1 && dias <= 7) return `Vence en ${dias} días`;
  return `Vence ${formatoCorto(tarea.fecha_limite)}`;
}

// Matriz de semanas (6x7) para pintar un mes de calendario, con relleno de
// días del mes anterior/siguiente para completar la grilla.
export function matrizMes(anio, mes) {
  const primerDia = new Date(anio, mes, 1);
  const inicioGrilla = new Date(anio, mes, 1 - primerDia.getDay());
  const semanas = [];
  const cursor = new Date(inicioGrilla);

  for (let s = 0; s < 6; s++) {
    const semana = [];
    for (let d = 0; d < 7; d++) {
      semana.push({
        fecha: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`,
        enMes: cursor.getMonth() === mes,
        esHoy: cursor.toDateString() === new Date().toDateString(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

export function nombreMes(mes) {
  return MESES[mes];
}

export function inicioSemana(iso) {
  const f = aFechaLocal(iso);
  f.setDate(f.getDate() - f.getDay());
  return f;
}

export function sumarDias(iso, dias) {
  const f = aFechaLocal(iso);
  f.setDate(f.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

export const NOMBRES_DIA_CORTO = DIAS_CORTOS;
