-- 0035 — Bloque A: tareas que un grupo_trabajo puede recibir como
-- destinatario, y "toma voluntaria" — un miembro del grupo se autoasigna
-- una tarea sin responsable. Antes de eso, cierra un hueco en cargos que
-- esta misma migración vuelve consecuente (ver sección 1).

-- ============================================================
-- 1. cargos.grupo_trabajo_id: cierra la autoedición sin autoridad
-- ============================================================
--
-- grupo_trabajo_id (0033) no estaba protegido por fn_validar_cambio_cargo:
-- cargos_update (0009) solo exige puede_asignar() + es_descendiente(id), y
-- es_descendiente() es auto-inclusiva — cualquier coordinador
-- (puede_asignar()=true) podía hacer
--   update cargos set grupo_trabajo_id = <otro grupo de su misma rama>
--   where id = <su propio cargo>
-- sin pasar nunca por puede_gestionar_rama(), saltándose al subsecretario
-- dueño real de esa rama (fn_validar_grupo_cargo solo exige que el grupo
-- elegido sea de la MISMA subsecretaría/comisión que el propio cargo — es
-- una validación de consistencia referencial, no de autoridad).
-- Antes de este bloque era inofensivo: la membresía en un grupo solo
-- decidía qué horario/lugar de check-in veía el voluntario. Con Bloque A,
-- grupo_trabajo_id decide qué tareas ves y puedes tomar — tan sensible
-- como tipo/superior_id. Mismo patrón que 0020 (A1): comprobación
-- auto-inclusiva + columna sensible sin guardia.
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

  -- Cambiar de grupo (entrar, salir o saltar a otro) exige la misma
  -- autoridad que ya gobierna grupos_trabajo_escritura: quien administra
  -- esa subsecretaría/comisión, no simplemente "cualquiera dentro de la
  -- rama". new.subsecretaria_id/new.comision_id son los del propio cargo
  -- (no cambian en esta operación), así que identifican la rama correcta
  -- tanto para unirse como para salir.
  if new.grupo_trabajo_id is distinct from old.grupo_trabajo_id
     and not puede_gestionar_rama(new.subsecretaria_id, new.comision_id) then
    raise exception 'Solo quien gestiona esa subsecretaría o comisión puede cambiar el grupo de trabajo de un cargo.'
      using errcode = '42501';
  end if;

  if new.tipo is distinct from old.tipo
     or new.superior_id is distinct from old.superior_id
     or new.evaluador_id is distinct from old.evaluador_id
     or new.persona_id is distinct from old.persona_id
     or new.acceso_salud_acreditacion is distinct from old.acceso_salud_acreditacion
     or new.subsecretaria_id is distinct from old.subsecretaria_id
     or new.comision_id is distinct from old.comision_id
     or new.grupo_trabajo_id is distinct from old.grupo_trabajo_id then
    perform fn_registrar_bitacora('cargos', new.id, 'cambio_estructural', jsonb_build_object(
      'tipo_antes', old.tipo, 'tipo_despues', new.tipo,
      'superior_antes', old.superior_id, 'superior_despues', new.superior_id,
      'evaluador_antes', old.evaluador_id, 'evaluador_despues', new.evaluador_id,
      'persona_antes', old.persona_id, 'persona_despues', new.persona_id,
      'acceso_salud_antes', old.acceso_salud_acreditacion, 'acceso_salud_despues', new.acceso_salud_acreditacion,
      'subsecretaria_antes', old.subsecretaria_id, 'subsecretaria_despues', new.subsecretaria_id,
      'comision_antes', old.comision_id, 'comision_despues', new.comision_id,
      'grupo_trabajo_antes', old.grupo_trabajo_id, 'grupo_trabajo_despues', new.grupo_trabajo_id
    ));
  end if;

  return new;
end;
$$;
-- create or replace function no toca el trigger (trg_validar_cambio_cargo
-- ya apunta a este nombre, creado en 0020) ni el revoke de 0020, que sigue
-- vigente.

-- ============================================================
-- 2. tareas.grupo_trabajo_id
-- ============================================================

alter table tareas add column grupo_trabajo_id uuid references grupos_trabajo(id) on delete set null;

-- Compuesto, no simple: sirve tanto "todas las tareas de mi grupo" como
-- "las tareas de mi grupo sin tomar" (mismo estilo que idx_tareas_responsable
-- / idx_tareas_supervisor, ambos compuestos con la columna de filtro más
-- frecuente).
create index idx_tareas_grupo_trabajo on tareas(grupo_trabajo_id, responsable_cargo_id);

-- ------------------------------------------------- grupo_trabajo_actual()

-- Mismo patrón que superior_actual()/persona_visible() (0002): función
-- SECURITY DEFINER en vez de una subconsulta repetida contra `cargos`
-- dentro de políticas de OTRA tabla — evita repetir la evaluación de RLS
-- de cargos tres veces (select/update/update de tareas) y mantiene el
-- estilo establecido.
create or replace function grupo_trabajo_actual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.grupo_trabajo_id from cargos c where c.id = cargo_actual();
$$;

grant execute on function grupo_trabajo_actual() to authenticated;
-- CREATE FUNCTION otorga EXECUTE a PUBLIC por defecto — revoke explícito,
-- mismo criterio que puede_gestionar_rama (0033): sin esto anon también
-- podría invocarla directo (inofensivo, cargo_actual() da null), pero
-- rompe la simetría con las funciones de autorización más nuevas.
revoke execute on function grupo_trabajo_actual() from public, anon;

-- ============================================================
-- 3. RLS de tareas
-- ============================================================

drop policy tareas_select_rama on tareas;
create policy tareas_select_rama on tareas
  for select to authenticated
  using (
    es_super_admin()
    or es_descendiente(responsable_cargo_id)
    or es_descendiente(supervisor_cargo_id)
    -- Cualquier miembro del grupo destinatario ve TODAS sus tareas
    -- (tomadas o no) — visibilidad de equipo. Acotado a la propia
    -- membresía (grupo_trabajo_actual()), nunca a "cualquier grupo
    -- visible" — grupos_trabajo_select es abierta a todo autenticado,
    -- pero esto no filtra por ahí: filtra por el grupo real del cargo del
    -- usuario, así que ver el directorio de grupos no implica ver las
    -- tareas de un grupo ajeno.
    or (grupo_trabajo_id is not null and grupo_trabajo_id = grupo_trabajo_actual())
  );

drop policy tareas_insert on tareas;
create policy tareas_insert on tareas
  for insert to authenticated
  with check (
    puede_asignar()
    and (
      es_super_admin()
      or (
        (responsable_cargo_id is null or es_descendiente(responsable_cargo_id))
        and es_descendiente(supervisor_cargo_id)
      )
    )
    -- Apuntar a un grupo exige la misma autoridad que ya gobierna ese
    -- grupo (puede_gestionar_rama), no solo puede_asignar(): un
    -- coordinador que ya puede crear tareas individuales NO puede crear
    -- una tarea de equipo — decisión explícita del bloque.
    and (
      grupo_trabajo_id is null
      or exists (
        select 1 from grupos_trabajo g
        where g.id = grupo_trabajo_id
          and puede_gestionar_rama(g.subsecretaria_id, g.comision_id)
      )
    )
  );

drop policy tareas_update on tareas;
create policy tareas_update on tareas
  for update to authenticated
  using (
    es_super_admin()
    or responsable_cargo_id = cargo_actual()
    or supervisor_cargo_id = cargo_actual()
    or es_ascendiente_de(supervisor_cargo_id)
    or es_descendiente(responsable_cargo_id)
    -- Deja tocar una fila de grupo sin responsable (para tomarla) o que ya
    -- tengo tomada (para liberarla). Esto solo decide QUÉ FILAS puede
    -- intentar tocar un miembro simple; QUÉ CAMBIOS son legales en esa
    -- fila lo decide trg_toma_voluntaria_tarea, no esta política.
    or (
      grupo_trabajo_id is not null
      and grupo_trabajo_id = grupo_trabajo_actual()
      and (responsable_cargo_id is null or responsable_cargo_id = cargo_actual())
    )
  )
  with check (
    es_super_admin()
    or responsable_cargo_id = cargo_actual()
    or supervisor_cargo_id = cargo_actual()
    or es_ascendiente_de(supervisor_cargo_id)
    or es_descendiente(responsable_cargo_id)
    or (
      grupo_trabajo_id is not null
      and grupo_trabajo_id = grupo_trabajo_actual()
      and (responsable_cargo_id is null or responsable_cargo_id = cargo_actual())
    )
  );

-- ============================================================
-- 4. Toma / liberación voluntaria — validación de grano fino
-- ============================================================

create or replace function fn_toma_voluntaria_tarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  yo uuid := cargo_actual();
  v_es_gestion boolean;
begin
  -- Solo nos incumbe cuando responsable_cargo_id cambia. Cualquier otra
  -- edición la sigue gobernando tareas_update (RLS) +
  -- trg_transicion_estado_tarea, sin cambios.
  if new.responsable_cargo_id is distinct from old.responsable_cargo_id then

    -- Gestión real: super admin, el supervisor de la tarea, o un
    -- ascendiente suyo. Quien tiene esta autoridad reasigna con libertad
    -- total (a cualquier cargo, a null, junto con cualquier otro campo en
    -- el mismo UPDATE) — comportamiento ya existente, sin cambios.
    --
    -- Deliberadamente NO se incluye aquí "yo = old.responsable_cargo_id":
    -- hoy mismo, sin esta migración, tareas_update (WITH CHECK) ya impide
    -- que un responsable simple se quite a sí mismo o se reasigne
    -- (ninguna rama de la política vuelve a matchear la fila NUEVA salvo
    -- que también sea supervisor/ascendiente/admin). Tratar al responsable
    -- actual como "gestión" aquí reabriría exactamente esa vía: alguien
    -- liberando su propia tarea de grupo podría colar en el mismo UPDATE
    -- un cambio de título/prioridad/fecha_límite.
    v_es_gestion := es_super_admin()
                    or yo = old.supervisor_cargo_id
                    or es_ascendiente_de(old.supervisor_cargo_id);

    if not v_es_gestion then
      -- Cinturón además del tirante: revalida la membresía en base de
      -- datos en vez de confiar en que tareas_update (USING) ya filtró
      -- correctamente la fila.
      if old.grupo_trabajo_id is null
         or not exists (
           select 1 from cargos c
           where c.id = yo and c.grupo_trabajo_id = old.grupo_trabajo_id
         )
      then
        raise exception 'Solo un miembro del grupo de trabajo puede tomar o liberar esta tarea.'
          using errcode = '42501';
      end if;

      -- Única transición legal para un miembro simple: tomar (null -> yo)
      -- o liberar la que tomó (yo -> null). Nada más.
      if not (
        (old.responsable_cargo_id is null and new.responsable_cargo_id = yo)
        or (old.responsable_cargo_id = yo and new.responsable_cargo_id is null)
      ) then
        raise exception 'Solo puedes tomar una tarea de tu grupo que esté sin responsable, o liberar la que tú mismo tomaste.'
          using errcode = '42501';
      end if;

      -- Y en ese UPDATE no puede colarse ningún otro cambio: comparación
      -- explícita columna por columna (mismo estilo que
      -- fn_validar_cambio_cargo, 0020/0027/0030). No incluye
      -- actualizada_en: trg_transicion_estado_tarea la refresca en TODO
      -- UPDATE, sin relación con lo que de verdad cambió aquí; ni id ni
      -- creada_en, inmutables por diseño.
      if new.titulo is distinct from old.titulo
         or new.descripcion is distinct from old.descripcion
         or new.actividad_id is distinct from old.actividad_id
         or new.supervisor_cargo_id is distinct from old.supervisor_cargo_id
         or new.grupo_trabajo_id is distinct from old.grupo_trabajo_id
         or new.prioridad is distinct from old.prioridad
         or new.fecha_limite is distinct from old.fecha_limite
         or new.estado is distinct from old.estado
         or new.progreso is distinct from old.progreso
         or new.requiere_evidencia is distinct from old.requiere_evidencia
         or new.motivo_devolucion is distinct from old.motivo_devolucion
         or new.creada_por is distinct from old.creada_por
      then
        raise exception 'Tomar o liberar una tarea de grupo solo puede cambiar el responsable, ningún otro campo.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Alfabéticamente antes de trg_transicion_estado_tarea ("toma" < "transicion"),
-- aunque el orden no importa: los dos triggers mutan/validan columnas
-- disjuntas, y el único punto en común (actualizada_en) queda
-- deliberadamente fuera de la comparación de arriba.
create trigger trg_toma_voluntaria_tarea
  before update on tareas
  for each row execute function fn_toma_voluntaria_tarea();

revoke execute on function fn_toma_voluntaria_tarea() from public, anon, authenticated;

-- ============================================================
-- 5. v_tareas: recoge la columna nueva
-- ============================================================
--
-- create or replace view no sirve aquí, mismo motivo que 0032: t.* se
-- reexpande con grupo_trabajo_id añadida al final de la TABLA (ALTER TABLE
-- ADD COLUMN siempre añade al final), lo que desplazaría a `vencida` de la
-- posición 16 a la 17 — Postgres exige que las columnas de salida
-- existentes conserven nombre y posición. Hace falta drop + create.
drop view v_tareas;

create view v_tareas as
  select t.*,
         (t.fecha_limite is not null
          and t.fecha_limite < current_date
          and t.estado not in ('completada','cancelada','no_aplica')) as vencida
  from tareas t;

alter view v_tareas set (security_invoker = on);
grant select on v_tareas to authenticated;
