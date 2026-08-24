-- 0032 — Bloque 0, fase "contraer": corta el flujo de texto libre.
-- Reescribe fn_calcular_puntualidad() y las dos vistas de tablero para usar
-- los FKs de 0030, y elimina las columnas de texto. Debe desplegarse en el
-- mismo lote que el frontend actualizado.

create or replace function fn_calcular_puntualidad()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subsecretaria_id uuid;
  v_comision_id uuid;
  v_tolerancia tolerancias_puntualidad%rowtype;
begin
  if new.tipo <> 'entrada' then
    return new;
  end if;

  select subsecretaria_id, comision_id into v_subsecretaria_id, v_comision_id
    from cargos where id = new.cargo_id;

  if v_subsecretaria_id is not null then
    select * into v_tolerancia from tolerancias_puntualidad where subsecretaria_id = v_subsecretaria_id;
  elsif v_comision_id is not null then
    select * into v_tolerancia from tolerancias_puntualidad where comision_id = v_comision_id;
  else
    return new;
  end if;

  if not found then
    return new;
  end if;

  new.minutos_tardanza := greatest(0, extract(epoch from (new.hora - v_tolerancia.hora_programada)) / 60);
  new.puntual := (new.hora <= v_tolerancia.hora_programada + make_interval(mins => v_tolerancia.tolerancia_minutos));
  return new;
end;
$$;

-- create or replace view no sirve aquí: Postgres exige que el nombre y
-- orden de columnas existentes se mantenga (solo se pueden AÑADIR columnas
-- al final), y estamos renombrando "subsecretaria" -> "rama". Hace falta
-- drop + create.

drop view v_tablero_avance_rama;

create view v_tablero_avance_rama as
  select
    c.division,
    coalesce(s.nombre, cm.nombre) as rama,
    count(*) filter (where t.estado not in ('cancelada', 'no_aplica')) as total,
    count(*) filter (where t.estado = 'completada') as completadas,
    round(
      100.0 * count(*) filter (where t.estado = 'completada')
      / nullif(count(*) filter (where t.estado not in ('cancelada', 'no_aplica')), 0)
    , 1) as porcentaje_avance
  from tareas t
  join cargos c on c.id = t.responsable_cargo_id
  left join subsecretarias s on s.id = c.subsecretaria_id
  left join comisiones cm on cm.id = c.comision_id
  group by c.division, coalesce(s.nombre, cm.nombre);

alter view v_tablero_avance_rama set (security_invoker = on);
grant select on v_tablero_avance_rama to authenticated;

drop view v_tablero_cargos_vacantes;

create view v_tablero_cargos_vacantes as
  select
    c.division,
    coalesce(s.nombre, cm.nombre) as rama,
    count(*) as vacantes
  from cargos c
  left join subsecretarias s on s.id = c.subsecretaria_id
  left join comisiones cm on cm.id = c.comision_id
  where c.activo and c.persona_id is null
  group by c.division, coalesce(s.nombre, cm.nombre);

alter view v_tablero_cargos_vacantes set (security_invoker = on);
grant select on v_tablero_cargos_vacantes to authenticated;

-- ------------------------------------------------------------- drop de texto

alter table cargos drop column subsecretaria;
alter table cargos drop column comision;
alter table tolerancias_puntualidad drop column subsecretaria;
