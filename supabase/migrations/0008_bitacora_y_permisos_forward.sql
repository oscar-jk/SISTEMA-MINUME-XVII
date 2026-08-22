-- 0008 — Bitácora de auditoría mínima y helper de evaluador
-- Fundacional: todo lo que viene después (sustitución de titular, cuentas,
-- purga de evidencia, anulación de asistencia) escribe aquí. Se construye
-- primero para que nada quede sin rastro desde el día uno.

create table bitacora (
  id           uuid primary key default gen_random_uuid(),
  tabla        text not null,
  registro_id  uuid,
  accion       text not null,
  cargo_id     uuid references cargos(id),
  detalle      jsonb,
  creado_en    timestamptz not null default now()
);

create index idx_bitacora_creado_en on bitacora(creado_en desc);

alter table bitacora enable row level security;

-- Ítem 28: legible solo por super admin y SG.
create policy bitacora_select on bitacora
  for select to authenticated
  using (
    es_super_admin()
    or (select c.tipo from cargos c where c.id = cargo_actual()) = 'sg'
  );

-- Sin política de INSERT/UPDATE/DELETE para `authenticated`: solo se llena
-- desde funciones security definer, mismo patrón que avances_tarea.

create or replace function fn_registrar_bitacora(
  p_tabla text, p_registro_id uuid, p_accion text, p_detalle jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into bitacora (tabla, registro_id, accion, cargo_id, detalle)
  values (p_tabla, p_registro_id, p_accion, cargo_actual(), p_detalle);
end;
$$;

-- Preparación para V1.1 (permiso de calificar según evaluador asignado,
-- no según jerarquía). Sin UI todavía.
create or replace function es_evaluador_de(cargo uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cargo is not null and exists (
    select 1 from cargos c where c.id = cargo and c.evaluador_id = cargo_actual()
  );
$$;

revoke execute on function es_evaluador_de(uuid) from public, anon;
grant execute on function es_evaluador_de(uuid) to authenticated;

-- fn_registrar_bitacora no se expone a REST: solo la llaman otras
-- funciones security definer, nunca el cliente directamente.
revoke execute on function fn_registrar_bitacora(text, uuid, text, jsonb) from public, anon, authenticated;
