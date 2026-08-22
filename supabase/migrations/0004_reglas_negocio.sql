-- MINUME XVII — 0004 Reglas de negocio
-- Lo que la RLS no puede expresar (transiciones de estado, inmutabilidad,
-- despliegue y re-fechado) vive en triggers y funciones, no en el frontend.

-- ------------------------------- el responsable no cierra su propia tarea

create or replace function fn_transicion_estado_tarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  yo uuid := cargo_actual();
begin
  new.actualizada_en := now();

  if new.estado is distinct from old.estado then

    -- Aprobar es potestad del supervisor de esa tarea o de un ascendiente suyo.
    -- Un responsable no puede marcar su propia tarea como completada.
    if new.estado = 'completada' then
      if not (es_super_admin()
              or new.supervisor_cargo_id = yo
              or es_ascendiente_de(new.supervisor_cargo_id)) then
        raise exception
          'Solo el supervisor de la tarea, o un ascendiente suyo, puede darla por completada.'
          using errcode = '42501';
      end if;
    end if;

    -- Devolver desde revisión exige decir por qué.
    if old.estado = 'en_revision' and new.estado = 'en_curso' then
      if new.motivo_devolucion is null or btrim(new.motivo_devolucion) = '' then
        raise exception 'Devolver una tarea a en_curso exige un motivo.'
          using errcode = '23514';
      end if;
    end if;

    -- Cancelar o marcar no_aplica: también cadena de supervisión.
    if new.estado in ('cancelada','no_aplica') then
      if not (es_super_admin()
              or new.supervisor_cargo_id = yo
              or es_ascendiente_de(new.supervisor_cargo_id)) then
        raise exception 'Solo la cadena de supervisión puede cancelar o descartar una tarea.'
          using errcode = '42501';
      end if;
    end if;

    -- Al enviar a revisión se limpia el motivo de la devolución anterior.
    if new.estado = 'en_revision' then
      new.motivo_devolucion := null;
    end if;
  end if;

  -- El progreso lo fija el último avance, nunca una edición directa.
  if new.progreso is distinct from old.progreso
     and current_setting('minume.avance', true) is distinct from 'on' then
    new.progreso := old.progreso;
  end if;

  return new;
end;
$$;

create trigger trg_transicion_estado_tarea
  before update on tareas
  for each row execute function fn_transicion_estado_tarea();

-- ------------------------------ el progreso de la tarea es el último avance

create or replace function fn_progreso_desde_avance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('minume.avance', 'on', true);

  update tareas
     set progreso = new.progreso_reportado,
         estado = case
                    when estado = 'no_iniciada' then 'en_curso'::estado_tarea
                    else estado
                  end,
         actualizada_en = now()
   where id = new.tarea_id;

  perform set_config('minume.avance', 'off', true);
  return new;
end;
$$;

create trigger trg_progreso_desde_avance
  after insert on avances_tarea
  for each row execute function fn_progreso_desde_avance();

-- ------------------------------------------- el historial es inmutable

-- Cinturón además del tirante: `avances_tarea` no tiene política de UPDATE
-- ni de DELETE en 0003, y aquí se bloquea también para roles con BYPASSRLS.
create or replace function fn_avance_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los avances son inmutables: no se editan ni se borran.'
    using errcode = '42501';
end;
$$;

create trigger trg_avance_inmutable
  before update or delete on avances_tarea
  for each row execute function fn_avance_inmutable();

-- --------------------------------- desplegar las tareas de una actividad

-- Genera tantas tareas como indique la dotación requerida, precargando
-- fecha límite y área. Quedan sin responsable: el usuario lo asigna antes
-- de confirmar. Dotación 8 → 8 tareas.
create or replace function fn_desplegar_actividad(
  p_actividad uuid,
  p_supervisor uuid,
  p_titulos text[] default null
)
returns setof tareas
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  a actividades%rowtype;
  i integer;
  t text;
begin
  select * into a from actividades where id = p_actividad;
  if not found then
    raise exception 'La actividad no existe o no es visible.';
  end if;

  if not puede_asignar() then
    raise exception 'No tienes permiso para desplegar tareas.' using errcode = '42501';
  end if;

  for i in 1 .. greatest(a.dotacion_requerida, 0) loop
    t := coalesce(p_titulos[i], a.nombre || ' — puesto ' || i);
    return query
      insert into tareas (
        actividad_id, titulo, descripcion, supervisor_cargo_id,
        prioridad, fecha_limite, estado, creada_por
      ) values (
        a.id, t,
        coalesce(a.area_responsable, '') ,
        p_supervisor,
        a.prioridad, a.fecha, 'no_iniciada', cargo_actual()
      )
      returning *;
  end loop;
end;
$$;

-- ------------------------------------------- re-fechado en bloque

-- La fecha del evento aún no está confirmada. Mover un rango de actividades
-- mueve también, en la misma transacción, las fechas límite de sus tareas.
create or replace function fn_refechar_rango(
  p_desde date,
  p_hasta date,
  p_dias integer
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not puede_asignar() then
    raise exception 'No tienes permiso para re-fechar actividades.' using errcode = '42501';
  end if;

  with movidas as (
    update actividades
       set fecha = fecha + p_dias
     where fecha between p_desde and p_hasta
    returning id
  )
  update tareas
     set fecha_limite = fecha_limite + p_dias
   where actividad_id in (select id from movidas)
     and fecha_limite is not null;

  select count(*) into n
  from actividades
  where fecha between p_desde + p_dias and p_hasta + p_dias;

  return n;
end;
$$;

grant execute on function fn_desplegar_actividad(uuid, uuid, text[]) to authenticated;
grant execute on function fn_refechar_rango(date, date, integer) to authenticated;

-- ------------------------------------------------------- vencimientos

-- Una tarea con fecha límite pasada y estado distinto de completada está
-- vencida. Sin correos: el aviso vive dentro de la aplicación.
create or replace view v_tareas as
  select t.*,
         (t.fecha_limite is not null
          and t.fecha_limite < current_date
          and t.estado not in ('completada','cancelada','no_aplica')) as vencida
  from tareas t;

alter view v_tareas set (security_invoker = on);
grant select on v_tareas to authenticated;
