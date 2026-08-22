-- 0024 — C1: tablero consolidado. Siete vistas de agregación, todas
-- security_invoker (mismo patrón que v_tareas/v_horas_servicio): el
-- alcance de cada indicador lo decide la RLS de las tablas base, no una
-- condición aparte en la vista ni en el frontend — un voluntario agrega
-- solo lo suyo, un jefe de rama agrega su rama, el SG lo ve todo.

create or replace view v_tablero_avance_rama as
  select
    c.division,
    c.subsecretaria,
    count(*) filter (where t.estado not in ('cancelada', 'no_aplica')) as total,
    count(*) filter (where t.estado = 'completada') as completadas,
    round(
      100.0 * count(*) filter (where t.estado = 'completada')
      / nullif(count(*) filter (where t.estado not in ('cancelada', 'no_aplica')), 0)
    , 1) as porcentaje_avance
  from tareas t
  join cargos c on c.id = t.responsable_cargo_id
  group by c.division, c.subsecretaria;

create or replace view v_tablero_tareas_vencidas as
  select
    t.responsable_cargo_id,
    c.nombre as responsable_nombre,
    c.division,
    count(*) as vencidas
  from tareas t
  join cargos c on c.id = t.responsable_cargo_id
  where t.fecha_limite is not null
    and t.fecha_limite < current_date_local()
    and t.estado not in ('completada', 'cancelada', 'no_aplica')
  group by t.responsable_cargo_id, c.nombre, c.division;

create or replace view v_tablero_revision_pendiente as
  select
    t.id, t.titulo, t.responsable_cargo_id, t.supervisor_cargo_id, t.actualizada_en,
    extract(epoch from (now() - t.actualizada_en)) / 3600.0 as horas_esperando
  from tareas t
  where t.estado = 'en_revision';

-- dotación = cargos activos con titular en la división; marcados/tardanzas
-- salen de asistencia.entrada de hoy. "Ausentes" no se calcula aquí: es
-- dotación - marcados, aritmética simple que el frontend puede hacer sin
-- descargar filas adicionales.
create or replace view v_tablero_asistencia_hoy as
  select
    c.division,
    count(*) as dotacion,
    count(*) filter (
      where exists (
        select 1 from asistencia a
        where a.cargo_id = c.id and a.fecha = current_date_local()
          and a.tipo = 'entrada' and a.estado <> 'anulado'
      )
    ) as marcados,
    count(*) filter (
      where exists (
        select 1 from asistencia a
        where a.cargo_id = c.id and a.fecha = current_date_local()
          and a.tipo = 'entrada' and a.estado <> 'anulado' and a.puntual = false
      )
    ) as tardanzas
  from cargos c
  where c.activo and c.persona_id is not null
  group by c.division;

create or replace view v_tablero_evidencia_pendiente as
  select c.division, count(*) as pendientes
  from evidencias e
  join tareas t on t.id = e.tarea_id
  join cargos c on c.id = t.responsable_cargo_id
  where e.estado = 'pendiente'
  group by c.division;

-- "Dotación cubierta" = personal con asignación de espacio ese mismo día
-- en el espacio de la actividad — proxy directo, no un módulo de turnos
-- aparte que no existe todavía.
create or replace view v_tablero_actividades_semana as
  select
    a.id, a.codigo, a.nombre, a.fecha, a.dotacion_requerida,
    coalesce(count(distinct ae.cargo_id), 0) as dotacion_cubierta
  from actividades a
  left join asignaciones_espacio ae on ae.espacio_id = a.espacio_id and ae.fecha = a.fecha
  where a.fecha between current_date_local() and current_date_local() + 7
    and a.estado <> 'cancelada'
  group by a.id, a.codigo, a.nombre, a.fecha, a.dotacion_requerida;

create or replace view v_tablero_cargos_vacantes as
  select division, subsecretaria, count(*) as vacantes
  from cargos
  where activo and persona_id is null
  group by division, subsecretaria;

alter view v_tablero_avance_rama set (security_invoker = on);
alter view v_tablero_tareas_vencidas set (security_invoker = on);
alter view v_tablero_revision_pendiente set (security_invoker = on);
alter view v_tablero_asistencia_hoy set (security_invoker = on);
alter view v_tablero_evidencia_pendiente set (security_invoker = on);
alter view v_tablero_actividades_semana set (security_invoker = on);
alter view v_tablero_cargos_vacantes set (security_invoker = on);

grant select on v_tablero_avance_rama, v_tablero_tareas_vencidas, v_tablero_revision_pendiente,
  v_tablero_asistencia_hoy, v_tablero_evidencia_pendiente, v_tablero_actividades_semana,
  v_tablero_cargos_vacantes to authenticated;
