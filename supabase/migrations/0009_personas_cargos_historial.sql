-- 0009 — Personas y cargos: documento/foto, historial de titulares,
-- sustitución, y apertura de la escritura a cualquier jefe de rama
-- (puede_asignar()), no solo al super admin.

alter table personas add column documento text, add column foto_url text;
alter table cargos
  add column fecha_alta date not null default current_date,
  add column fecha_baja date;

create table historial_titulares_cargo (
  id                 uuid primary key default gen_random_uuid(),
  cargo_id           uuid not null references cargos(id),
  persona_anterior_id uuid references personas(id),
  persona_nueva_id   uuid references personas(id),
  motivo             text not null,
  responsable_cargo_id uuid references cargos(id),
  sustituido_en      timestamptz not null default now()
);

alter table historial_titulares_cargo enable row level security;

create policy historial_titulares_select on historial_titulares_cargo
  for select to authenticated
  using (es_super_admin() or es_descendiente(cargo_id));

-- Solo fn_sustituir_titular inserta aquí; sin política de INSERT directa
-- para `authenticated`. La función es SECURITY INVOKER, así que necesita
-- su propia política — la agrega puede_asignar() sobre el cargo en rama.
create policy historial_titulares_insert on historial_titulares_cargo
  for insert to authenticated
  with check (puede_asignar() and es_descendiente(cargo_id));

-- Reemplaza personas_admin_todo / cargos_admin_todo de 0003_rls.sql: ahora
-- cualquier jefe de rama (puede_asignar()) gestiona personas y cargos
-- dentro de su propia rama, no solo el super admin.
drop policy personas_admin_todo on personas;
create policy personas_insert on personas
  for insert to authenticated with check (puede_asignar());
create policy personas_update on personas
  for update to authenticated using (puede_asignar() and persona_visible(id))
  with check (puede_asignar() and persona_visible(id));
create policy personas_delete on personas
  for delete to authenticated using (es_super_admin());

drop policy cargos_admin_todo on cargos;
-- Un cargo raíz (sin superior) solo lo crea el super admin; dentro de una
-- rama, cualquier jefe de esa rama puede añadir cargos bajo de sí.
create policy cargos_insert on cargos
  for insert to authenticated
  with check (
    es_super_admin()
    or (puede_asignar() and superior_id is not null and es_descendiente(superior_id))
  );
create policy cargos_update on cargos
  for update to authenticated
  using (puede_asignar() and (es_super_admin() or es_descendiente(id)))
  with check (puede_asignar() and (es_super_admin() or es_descendiente(id)));
create policy cargos_delete on cargos
  for delete to authenticated using (es_super_admin());

-- La reasignación automática de tareas abiertas (ítem 12) no necesita
-- código propio: tareas.responsable_cargo_id/supervisor_cargo_id apuntan a
-- cargos.id, no a personas.id, así que repuntar cargos.persona_id deja las
-- tareas abiertas con el nuevo titular sin tocarlas.
create or replace function fn_sustituir_titular(
  p_cargo uuid, p_persona_nueva uuid, p_motivo text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_persona_anterior uuid;
begin
  if not (puede_asignar() and (es_super_admin() or es_descendiente(p_cargo))) then
    raise exception 'No tienes permiso para sustituir el titular de este cargo.'
      using errcode = '42501';
  end if;

  select persona_id into v_persona_anterior from cargos where id = p_cargo;

  update cargos set persona_id = p_persona_nueva where id = p_cargo;

  insert into historial_titulares_cargo
    (cargo_id, persona_anterior_id, persona_nueva_id, motivo, responsable_cargo_id)
  values (p_cargo, v_persona_anterior, p_persona_nueva, p_motivo, cargo_actual());

  perform fn_registrar_bitacora('cargos', p_cargo, 'sustitucion',
    jsonb_build_object('persona_anterior', v_persona_anterior, 'persona_nueva', p_persona_nueva, 'motivo', p_motivo));
end;
$$;

revoke execute on function fn_sustituir_titular(uuid, uuid, text) from public, anon;
grant execute on function fn_sustituir_titular(uuid, uuid, text) to authenticated;
