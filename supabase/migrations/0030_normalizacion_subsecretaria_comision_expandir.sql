-- 0030 — Bloque 0: normaliza cargos.subsecretaria/comision (texto libre) a
-- FKs contra catálogos estructurados. Fase "expandir": solo añade tablas y
-- columnas nuevas, no toca nada que el frontend actual lea o escriba —
-- compatible con el frontend en producción sin cambios. La fase "contraer"
-- (0032) hace el corte de verdad y debe desplegarse junto al frontend nuevo.

-- ------------------------------------------------------------ comisiones

create table comisiones (
  id     uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null unique,
  activa boolean not null default true
);

alter table comisiones enable row level security;

create policy comisiones_select on comisiones
  for select to authenticated using (true);
create policy comisiones_escritura on comisiones
  for all to authenticated using (puede_asignar()) with check (puede_asignar());

-- ------------------------------------------------- subsecretarias.division

-- Reutiliza el enum division existente (sg/sga/sgl) en vez de inventar uno
-- nuevo — mismo tipo que cargos.division, sin casts en los joins. El CHECK
-- excluye 'sga' explícitamente: SGA se organiza por comisiones, no por
-- subsecretarías. Nullable porque las dos filas ya sembradas ('Operaciones',
-- 'Academica' en 0016_seed_v1.sql) no tienen división asignable sin
-- inventar un valor — quedan sin clasificar a propósito.
alter table subsecretarias add column division division;
alter table subsecretarias add constraint subsecretarias_division_check
  check (division is null or division in ('sg', 'sgl'));

-- ------------------------------------------------------ cargos.*_id (FK)

alter table cargos add column subsecretaria_id uuid references subsecretarias(id) on delete set null;
alter table cargos add column comision_id uuid references comisiones(id) on delete set null;

create index idx_cargos_subsecretaria on cargos(subsecretaria_id);
create index idx_cargos_comision on cargos(comision_id);

-- ------------------------------------------- trigger de consistencia estructural

-- Sibling de fn_validar_cambio_cargo (0020/0027): concerns separados a
-- propósito — aquella protege contra auto-escalada de privilegios en
-- UPDATE; esta valida que subsecretaria_id/comision_id encajen con
-- division en CUALQUIER escritura. Debe correr en INSERT también:
-- cargos_insert (0009) deja a cualquier puede_asignar() insertar un cargo
-- con estas columnas puestas directamente, no solo al super admin vía UPDATE.
create or replace function fn_validar_estructura_cargo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_division_subsecretaria division;
begin
  if new.subsecretaria_id is not null and new.comision_id is not null then
    raise exception 'Un cargo no puede tener subsecretaría y comisión a la vez.'
      using errcode = '23514';
  end if;

  if new.comision_id is not null and new.division is distinct from 'sga' then
    raise exception 'Solo un cargo de división SGA puede tener comisión asignada.'
      using errcode = '23514';
  end if;

  if new.subsecretaria_id is not null then
    if new.division is null or new.division not in ('sg', 'sgl') then
      raise exception 'Solo un cargo de división SG o SGL puede tener subsecretaría asignada.'
        using errcode = '23514';
    end if;

    select division into v_division_subsecretaria
    from subsecretarias where id = new.subsecretaria_id;

    if v_division_subsecretaria is distinct from new.division then
      raise exception 'La subsecretaría elegida no pertenece a la misma división que el cargo.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validar_estructura_cargo
  before insert or update on cargos
  for each row execute function fn_validar_estructura_cargo();

revoke execute on function fn_validar_estructura_cargo() from public, anon, authenticated;

-- ------------------------------------------ tolerancias_puntualidad (FK)

alter table tolerancias_puntualidad add column subsecretaria_id uuid references subsecretarias(id) on delete cascade;
alter table tolerancias_puntualidad add column comision_id uuid references comisiones(id) on delete cascade;

-- Exactamente una de las dos, o ambas null (fila "default" reservada para
-- un futuro bloque — sin uso en Bloque 0, el frontend nunca la produce
-- todavía). Nunca ambas a la vez.
alter table tolerancias_puntualidad add constraint tolerancias_una_sola_rama_check
  check (not (subsecretaria_id is not null and comision_id is not null));

-- Un límite de tolerancia por subsecretaría/comisión — índices parciales
-- porque la columna es nullable y "muchas filas con null" no debe chocar.
create unique index ux_tolerancias_subsecretaria on tolerancias_puntualidad(subsecretaria_id) where subsecretaria_id is not null;
create unique index ux_tolerancias_comision on tolerancias_puntualidad(comision_id) where comision_id is not null;

-- ------------------------------------ extiende auditoría de fn_validar_cambio_cargo

-- Ya audita tipo/superior_id/evaluador_id/persona_id/acceso_salud_acreditacion
-- (0027) — se completa con subsecretaria_id/comision_id para que la
-- bitácora siga siendo el registro completo de cambios estructurales de un
-- cargo, sin crear un mecanismo de auditoría nuevo.
create or replace function fn_validar_cambio_cargo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not es_super_admin() then
    if new.tipo is distinct from old.tipo
       or new.superior_id is distinct from old.superior_id
       or new.evaluador_id is distinct from old.evaluador_id
       or new.acceso_salud_acreditacion is distinct from old.acceso_salud_acreditacion then
      raise exception 'Solo el super admin puede cambiar el tipo, el superior, el evaluador o el acceso a datos de salud de un cargo.'
        using errcode = '42501';
    end if;
  end if;

  if new.superior_id is null and old.superior_id is not null and not es_super_admin() then
    raise exception 'Solo el super admin puede convertir un cargo en raíz de la jerarquía.'
      using errcode = '42501';
  end if;

  if new.superior_id is not null and new.superior_id is distinct from old.superior_id then
    if exists (
      with recursive descendientes as (
        select id from cargos where id = old.id
        union all
        select c.id from cargos c join descendientes d on c.superior_id = d.id
      )
      select 1 from descendientes where id = new.superior_id
    ) then
      raise exception 'Ese cargo no puede ser su propio superior ni el de un descendiente suyo (crearía un ciclo).'
        using errcode = '23514';
    end if;
  end if;

  if new.tipo is distinct from old.tipo
     or new.superior_id is distinct from old.superior_id
     or new.evaluador_id is distinct from old.evaluador_id
     or new.persona_id is distinct from old.persona_id
     or new.acceso_salud_acreditacion is distinct from old.acceso_salud_acreditacion
     or new.subsecretaria_id is distinct from old.subsecretaria_id
     or new.comision_id is distinct from old.comision_id then
    perform fn_registrar_bitacora('cargos', new.id, 'cambio_estructural', jsonb_build_object(
      'tipo_antes', old.tipo, 'tipo_despues', new.tipo,
      'superior_antes', old.superior_id, 'superior_despues', new.superior_id,
      'evaluador_antes', old.evaluador_id, 'evaluador_despues', new.evaluador_id,
      'persona_antes', old.persona_id, 'persona_despues', new.persona_id,
      'acceso_salud_antes', old.acceso_salud_acreditacion, 'acceso_salud_despues', new.acceso_salud_acreditacion,
      'subsecretaria_antes', old.subsecretaria_id, 'subsecretaria_despues', new.subsecretaria_id,
      'comision_antes', old.comision_id, 'comision_despues', new.comision_id
    ));
  end if;

  return new;
end;
$$;
