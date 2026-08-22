-- 0014 — Evidencia fotográfica de cumplimiento: bucket privado, tabla,
-- transición aprobar/rechazar, y la RPC de purga (el borrado real del
-- objeto lo hace la Edge Function purgar-evidencia, no esta RPC).

insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

create table evidencias (
  id                   uuid primary key default gen_random_uuid(),
  tarea_id             uuid not null references tareas(id),
  avance_id            uuid references avances_tarea(id),
  autor_cargo_id       uuid not null references cargos(id),
  foto_path            text,
  tamano_bytes         integer,
  reporte              text not null,
  estado               text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo       text,
  puntaje              numeric(6,2),
  revisado_por_cargo_id uuid references cargos(id),
  revisado_en          timestamptz,
  purgada_en           timestamptz,
  creada_en            timestamptz not null default now()
);

alter table evidencias enable row level security;

create policy evidencias_select on evidencias
  for select to authenticated using (puede_ver_tarea(tarea_id));

create policy evidencias_insert on evidencias
  for insert to authenticated
  with check (
    autor_cargo_id = cargo_actual()
    and exists (select 1 from tareas t where t.id = tarea_id and t.responsable_cargo_id = cargo_actual())
  );

create policy evidencias_update on evidencias
  for update to authenticated
  using (
    es_super_admin()
    or es_ascendiente_de((select t.supervisor_cargo_id from tareas t where t.id = tarea_id))
  )
  with check (
    es_super_admin()
    or es_ascendiente_de((select t.supervisor_cargo_id from tareas t where t.id = tarea_id))
  );

create or replace function fn_evidencia_transicion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supervisor uuid;
begin
  select supervisor_cargo_id into v_supervisor from tareas where id = new.tarea_id;

  -- Camino de purga: solo el foto_path pasa a null, nada más cambia.
  if old.estado = new.estado and new.foto_path is null and old.foto_path is not null then
    if not es_super_admin() then
      raise exception 'Solo el super admin puede purgar evidencia.' using errcode = '42501';
    end if;
    new.purgada_en := now();
    return new;
  end if;

  if old.estado <> 'pendiente' then
    raise exception 'Esta evidencia ya fue revisada; no se puede editar.' using errcode = '42501';
  end if;

  if new.estado = 'aprobada' then
    if not (es_super_admin() or es_ascendiente_de(v_supervisor)) then
      raise exception 'Solo el supervisor de la tarea, o un ascendiente suyo, puede aprobar evidencia.'
        using errcode = '42501';
    end if;
    if new.puntaje is null then
      raise exception 'Aprobar evidencia exige un puntaje.' using errcode = '23514';
    end if;
    new.revisado_por_cargo_id := cargo_actual();
    new.revisado_en := now();
  elsif new.estado = 'rechazada' then
    if not (es_super_admin() or es_ascendiente_de(v_supervisor)) then
      raise exception 'Solo el supervisor de la tarea, o un ascendiente suyo, puede rechazar evidencia.'
        using errcode = '42501';
    end if;
    if new.motivo_rechazo is null or btrim(new.motivo_rechazo) = '' then
      raise exception 'Rechazar evidencia exige un motivo.' using errcode = '23514';
    end if;
    new.revisado_por_cargo_id := cargo_actual();
    new.revisado_en := now();
  end if;

  return new;
end;
$$;

create trigger trg_evidencia_transicion
  before update on evidencias
  for each row execute function fn_evidencia_transicion();

-- Storage RLS. Ruta {tarea_id}/{uuid}.jpg — sin política de update/delete
-- para `authenticated`: el único borrado real pasa por la Edge Function
-- purgar-evidencia corriendo con service_role.
create policy evidencias_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'evidencias' and puede_ver_tarea((storage.foldername(name))[1]::uuid));

create policy evidencias_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias'
    and exists (
      select 1 from tareas t
      where t.id = (storage.foldername(name))[1]::uuid
        and t.responsable_cargo_id = cargo_actual()
    )
  );

create or replace function fn_purgar_evidencia_rango(p_desde date, p_hasta date)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not es_super_admin() then
    raise exception 'Solo el super admin puede purgar evidencia.' using errcode = '42501';
  end if;

  update evidencias
     set foto_path = null
   where foto_path is not null
     and creada_en::date between p_desde and p_hasta;
  get diagnostics n = row_count;

  perform fn_registrar_bitacora('evidencias', null, 'evidencia_purgada',
    jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'filas', n));

  return n;
end;
$$;

revoke execute on function fn_purgar_evidencia_rango(date, date) from public, anon;
grant execute on function fn_purgar_evidencia_rango(date, date) to authenticated;
