-- 0012 — Rastro de reasignación de tareas. La UI de los <select> inline en
-- actividad.js no cambia; el trigger captura el cambio en la base.

create table historial_reasignacion_tarea (
  id               uuid primary key default gen_random_uuid(),
  tarea_id         uuid not null references tareas(id),
  campo            text not null check (campo in ('responsable', 'supervisor')),
  cargo_anterior_id uuid references cargos(id),
  cargo_nuevo_id   uuid references cargos(id),
  cambiado_por     uuid references cargos(id),
  cambiado_en      timestamptz not null default now()
);

alter table historial_reasignacion_tarea enable row level security;

create policy historial_reasignacion_select on historial_reasignacion_tarea
  for select to authenticated using (puede_ver_tarea(tarea_id));
-- Sin política de escritura para `authenticated`: solo lo llena el trigger.

create or replace function fn_registrar_reasignacion_tarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.responsable_cargo_id is distinct from old.responsable_cargo_id then
    insert into historial_reasignacion_tarea (tarea_id, campo, cargo_anterior_id, cargo_nuevo_id, cambiado_por)
    values (new.id, 'responsable', old.responsable_cargo_id, new.responsable_cargo_id, cargo_actual());
  end if;
  if new.supervisor_cargo_id is distinct from old.supervisor_cargo_id then
    insert into historial_reasignacion_tarea (tarea_id, campo, cargo_anterior_id, cargo_nuevo_id, cambiado_por)
    values (new.id, 'supervisor', old.supervisor_cargo_id, new.supervisor_cargo_id, cargo_actual());
  end if;
  return new;
end;
$$;

create trigger trg_registrar_reasignacion_tarea
  after update of responsable_cargo_id, supervisor_cargo_id on tareas
  for each row execute function fn_registrar_reasignacion_tarea();

revoke execute on function fn_registrar_reasignacion_tarea() from public, anon, authenticated;
