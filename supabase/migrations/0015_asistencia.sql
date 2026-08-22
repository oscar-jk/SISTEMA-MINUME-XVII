-- 0015 — Marcaje de entrada/salida, tolerancias por subsecretaría,
-- bloqueo de salida si el corte que lo exige sigue abierto, y horas de
-- servicio acumuladas.

create table tolerancias_puntualidad (
  id                 uuid primary key default gen_random_uuid(),
  subsecretaria      text not null unique,
  hora_programada    time not null,
  tolerancia_minutos integer not null default 10
);

alter table tolerancias_puntualidad enable row level security;
create policy tolerancias_select on tolerancias_puntualidad for select to authenticated using (true);
create policy tolerancias_escritura on tolerancias_puntualidad for all to authenticated using (es_super_admin()) with check (es_super_admin());

-- Generaliza "Corte 3": cualquier corte marcado así bloquea la salida
-- mientras siga abierto, en vez de un nombre fijo.
alter table cortes_evaluacion add column bloquea_salida boolean not null default false;

create table asistencia (
  id                 uuid primary key default gen_random_uuid(),
  cargo_id           uuid not null references cargos(id),
  tipo               text not null check (tipo in ('entrada', 'salida')),
  fecha              date not null default current_date,
  hora               time not null default current_time,
  lugar              text,
  puntual            boolean,
  minutos_tardanza   integer,
  estado             text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'anulado')),
  aprobado_por       uuid references cargos(id),
  aprobado_en        timestamptz,
  motivo_anulacion   text,
  anulado_por        uuid references cargos(id),
  creado_en          timestamptz not null default now()
);

alter table asistencia enable row level security;

create policy asistencia_select on asistencia
  for select to authenticated
  using (es_descendiente(cargo_id) or cargo_id = cargo_actual());

create policy asistencia_insert on asistencia
  for insert to authenticated with check (cargo_id = cargo_actual());

create policy asistencia_delete on asistencia
  for delete to authenticated using (cargo_id = cargo_actual() and estado = 'pendiente');

create policy asistencia_update on asistencia
  for update to authenticated
  using (es_super_admin() or es_ascendiente_de(cargo_id))
  with check (es_super_admin() or es_ascendiente_de(cargo_id));

create or replace function fn_calcular_puntualidad()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subsecretaria text;
  v_tolerancia tolerancias_puntualidad%rowtype;
begin
  if new.tipo <> 'entrada' then
    return new;
  end if;

  select subsecretaria into v_subsecretaria from cargos where id = new.cargo_id;
  select * into v_tolerancia from tolerancias_puntualidad where subsecretaria = v_subsecretaria;

  if not found then
    return new;
  end if;

  new.minutos_tardanza := greatest(0, extract(epoch from (new.hora - v_tolerancia.hora_programada)) / 60);
  new.puntual := (new.hora <= v_tolerancia.hora_programada + make_interval(mins => v_tolerancia.tolerancia_minutos));
  return new;
end;
$$;

create trigger trg_calcular_puntualidad
  before insert on asistencia
  for each row execute function fn_calcular_puntualidad();

create or replace function fn_bloquear_salida_corte_abierto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tipo = 'salida' and exists (
    select 1 from cortes_evaluacion where bloquea_salida and not cerrado
  ) then
    raise exception 'Hay un corte de evaluación abierto que bloquea la salida.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_bloquear_salida_corte_abierto
  before insert on asistencia
  for each row execute function fn_bloquear_salida_corte_abierto();

create or replace function fn_transicion_asistencia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.estado = 'aprobado' and new.estado = 'anulado' then
    if new.motivo_anulacion is null or btrim(new.motivo_anulacion) = '' then
      raise exception 'Anular una asistencia aprobada exige un motivo.' using errcode = '23514';
    end if;
    new.anulado_por := cargo_actual();
    perform fn_registrar_bitacora('asistencia', new.id, 'asistencia_anulada',
      jsonb_build_object('motivo', new.motivo_anulacion));
    return new;
  end if;

  if old.estado = 'pendiente' and new.estado = 'aprobado' then
    new.aprobado_por := cargo_actual();
    new.aprobado_en := now();
    return new;
  end if;

  if old.estado <> new.estado then
    raise exception 'Transición de estado no permitida en asistencia.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_transicion_asistencia
  before update on asistencia
  for each row execute function fn_transicion_asistencia();

-- Empareja entrada/salida del mismo día por cargo, solo filas aprobadas,
-- y suma horas — respalda el acumulado de 60 horas anuales.
create or replace view v_horas_servicio as
  select
    e.cargo_id,
    e.fecha,
    e.hora as hora_entrada,
    s.hora as hora_salida,
    extract(epoch from (s.hora - e.hora)) / 3600.0 as horas
  from asistencia e
  join asistencia s
    on s.cargo_id = e.cargo_id and s.fecha = e.fecha and s.tipo = 'salida' and s.estado = 'aprobado'
  where e.tipo = 'entrada' and e.estado = 'aprobado';

alter view v_horas_servicio set (security_invoker = on);
grant select on v_horas_servicio to authenticated;

revoke execute on function fn_calcular_puntualidad() from public, anon, authenticated;
revoke execute on function fn_bloquear_salida_corte_abierto() from public, anon, authenticated;
revoke execute on function fn_transicion_asistencia() from public, anon, authenticated;
