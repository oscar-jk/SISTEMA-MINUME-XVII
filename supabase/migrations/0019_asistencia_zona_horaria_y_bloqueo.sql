-- 0019 — Corrige B1/B3 del bloque de bugs: asistencia.fecha/hora se
-- evaluaban en el servidor (UTC) con `current_date`/`current_time`, así
-- que todo marcaje después de las 8pm hora RD quedaba con la fecha del día
-- siguiente y fn_calcular_puntualidad() comparaba una hora UTC contra
-- tolerancias_puntualidad.hora_programada, pensada en hora local — todos
-- aparecían tarde. Se fija America/Santo_Domingo como única referencia vía
-- dos funciones reutilizables, para que ningún módulo futuro reintroduzca
-- UTC. Además, fn_bloquear_salida_corte_abierto() bloqueaba la salida de
-- TODA la organización con cualquier corte abierto, sin mirar fecha ni
-- rama — se acota a la ventana y a la división del corte.

create or replace function current_date_local()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Santo_Domingo')::date;
$$;

create or replace function current_time_local()
returns time
language sql
stable
as $$
  select (now() at time zone 'America/Santo_Domingo')::time;
$$;

grant execute on function current_date_local, current_time_local to authenticated;

alter table asistencia alter column fecha set default current_date_local();
alter table asistencia alter column hora set default current_time_local();

-- Alcance opcional del bloqueo de salida: null = toda la organización,
-- con valor = solo esa división. fn_calcular_puntualidad() no necesita
-- cambios: ya compara new.hora contra hora_programada sin llamar a
-- current_time, así que hereda la corrección solo con el default nuevo.
alter table cortes_evaluacion add column alcance_division division;
comment on column cortes_evaluacion.alcance_division is
  'null = el bloqueo de salida alcanza a toda la organización; con valor, solo a esa división.';

create or replace function fn_bloquear_salida_corte_abierto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_division division;
begin
  if new.tipo = 'salida' then
    select division into v_division from cargos where id = new.cargo_id;

    if exists (
      select 1 from cortes_evaluacion ce
      where ce.bloquea_salida
        and not ce.cerrado
        and current_date_local() between ce.fecha_inicio and ce.fecha_fin
        and (ce.alcance_division is null or ce.alcance_division = v_division)
    ) then
      raise exception 'Hay un corte de evaluación abierto que bloquea la salida en tu rama.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function fn_bloquear_salida_corte_abierto() from public, anon, authenticated;
