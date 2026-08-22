-- 0021 — Corrige B2: v_horas_servicio (0015) unía TODAS las entradas con
-- TODAS las salidas del mismo cargo/fecha — 2 entradas + 2 salidas producían
-- 4 filas, inflando el acumulado de horas. Tampoco soportaba un turno que
-- cruza medianoche (fecha distinta entre entrada y salida) ni descartaba
-- una salida anterior a su entrada. Se reescribe emparejando cada entrada
-- aprobada con la PRIMERA salida aprobada estrictamente posterior del mismo
-- cargo (comparando fecha+hora como un solo instante, no por fecha igual),
-- vía LATERAL — así nunca se generan más filas que entradas.
--
-- Qué NO cuenta: una entrada sin ninguna salida aprobada posterior (turno
-- abierto) queda fuera, igual que una salida sin ninguna entrada previa
-- (salida huérfana). Límite conocido y aceptado: si dos entradas seguidas
-- se registran sin una salida entre medio (dato mal capturado, no un caso
-- de uso válido), ambas emparejan con la misma siguiente salida y esa
-- salida se cuenta dos veces — no hay forma de distinguir cuál de las dos
-- entradas es la real sin una regla de negocio que hoy no existe.

-- create or replace no sirve aquí: cambia nombres de columna respecto a la
-- vista anterior (0015), y Postgres no permite renombrar columnas de una
-- vista con REPLACE — hay que soltarla y crearla de nuevo.
drop view if exists v_horas_servicio;

create view v_horas_servicio as
  select
    e.cargo_id,
    e.fecha as fecha_entrada,
    e.hora as hora_entrada,
    sal.fecha as fecha_salida,
    sal.hora as hora_salida,
    extract(epoch from ((sal.fecha + sal.hora) - (e.fecha + e.hora))) / 3600.0 as horas
  from asistencia e
  join lateral (
    select s.fecha, s.hora
    from asistencia s
    where s.cargo_id = e.cargo_id
      and s.tipo = 'salida'
      and s.estado = 'aprobado'
      and (s.fecha + s.hora) > (e.fecha + e.hora)
    order by (s.fecha + s.hora)
    limit 1
  ) sal on true
  where e.tipo = 'entrada' and e.estado = 'aprobado';

alter view v_horas_servicio set (security_invoker = on);
grant select on v_horas_servicio to authenticated;
