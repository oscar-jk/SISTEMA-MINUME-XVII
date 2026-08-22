-- 0011 — Estados de actividad alineados al catálogo y fases como catálogo
-- administrable (no texto libre, no hardcodeado).
--
-- Antes: planificada, confirmada, en_curso, realizada, cancelada.
-- Ahora:  no_iniciada, en_preparacion, en_curso, completada, cancelada, no_aplica.
-- Se usa RENAME VALUE (no crear-tipo-y-cambiar): solo cambia la etiqueta en
-- pg_enum, cada fila existente sigue apuntando al mismo OID interno — cero
-- reescritura de datos, cero riesgo para las actividades ya sembradas.
-- Restricción dura de Postgres: un valor de enum recién agregado no se
-- puede usar en la misma transacción que lo agregó, así que
-- `add value 'no_aplica'` va al final y ninguna fila la usa todavía aquí.

alter type estado_actividad rename value 'planificada' to 'no_iniciada';
alter type estado_actividad rename value 'confirmada' to 'en_preparacion';
alter type estado_actividad rename value 'realizada' to 'completada';
-- 'cancelada' no cambia de nombre.

create table fases_actividad (
  id     uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  orden  integer not null
);

alter table fases_actividad enable row level security;

create policy fases_select on fases_actividad
  for select to authenticated using (true);
create policy fases_escritura on fases_actividad
  for all to authenticated using (puede_asignar()) with check (puede_asignar());

insert into fases_actividad (codigo, nombre, orden) values
  ('pre-evento', 'Pre-evento', 1),
  ('llegada', 'Llegada', 2),
  ('sesiones', 'Sesiones', 3),
  ('clausura', 'Clausura', 4);

alter table actividades add column fase_id uuid references fases_actividad(id);

-- Backfill desde el texto libre existente. 'llegada' no tiene datos
-- legados (no existía como fase en el Módulo 1); queda disponible para
-- actividades nuevas. La columna `fase` de texto libre se conserva.
update actividades a
set fase_id = (select id from fases_actividad where codigo = 'pre-evento')
where a.fase = 'preparacion';

update actividades a
set fase_id = (select id from fases_actividad where codigo = 'sesiones')
where a.fase = 'ejecucion';

update actividades a
set fase_id = (select id from fases_actividad where codigo = 'clausura')
where a.fase = 'cierre';

-- Última línea: el valor recién agregado no se puede usar hasta que esta
-- transacción cierre.
alter type estado_actividad add value 'no_aplica';
