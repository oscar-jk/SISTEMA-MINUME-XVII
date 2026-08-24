-- 0043 — Bloque F: evaluación por cortes.
--
-- criterios_evaluacion, cortes_evaluacion y evaluaciones existen desde
-- 0001 con una sola política `for all using(es_super_admin())` cada una —
-- hoy solo el super admin puede siquiera leer estas tablas. es_evaluador_de()
-- (0008) nunca se ha llamado en ningún lado: "Preparación para V1.1
-- (permiso de calificar según evaluador asignado, no según jerarquía). Sin
-- UI todavía." Este bloque activa exactamente eso.

-- ------------------------------------------------------ evaluaciones (esquema)

-- Hueco de 0001: las cuatro columnas de identidad de una evaluación real
-- nunca son null en la práctica, pero el esquema no lo exigía, y
-- evaluador_id/criterio_id usaban `on delete set null` — incompatible con
-- not null. Se cambian a restrict (mismo criterio que solicitudes_ayuda:
-- borrar algo referenciado por una evaluación queda bloqueado, no la
-- desclasifica en silencio).
alter table evaluaciones drop constraint evaluaciones_evaluador_id_fkey;
alter table evaluaciones add constraint evaluaciones_evaluador_id_fkey
  foreign key (evaluador_id) references cargos(id) on delete restrict;
alter table evaluaciones drop constraint evaluaciones_criterio_id_fkey;
alter table evaluaciones add constraint evaluaciones_criterio_id_fkey
  foreign key (criterio_id) references criterios_evaluacion(id) on delete restrict;

alter table evaluaciones alter column corte_id set not null;
alter table evaluaciones alter column cargo_id set not null;
alter table evaluaciones alter column evaluador_id set not null;
alter table evaluaciones alter column criterio_id set not null;

alter table evaluaciones add constraint evaluaciones_unica
  unique (corte_id, cargo_id, criterio_id, evaluador_id);
-- Escala 0-10, asumida (no especificada en el nombre del bloque).
alter table evaluaciones add constraint evaluaciones_puntuacion_check
  check (puntuacion is null or puntuacion between 0 and 10);

-- ------------------------------------------- criterios_evaluacion / cortes_evaluacion (RLS)

-- Catálogos, no datos sensibles — mismo tratamiento que fases_actividad/
-- subsecretarias/comisiones. La política admin original (`for all
-- using(es_super_admin())`) se queda igual: con SELECT ya maximal por su
-- propia política dedicada, que la política admin también matchee SELECT
-- como permisiva adicional no abre ninguna fuga (`true or es_super_admin()`
-- sigue siendo `true`) — al revés del caso de 0037/0038, donde el SELECT
-- implícito de un `for all` era más angosto de lo necesario.
create policy criterios_select on criterios_evaluacion
  for select to authenticated using (true);
create policy cortes_select on cortes_evaluacion
  for select to authenticated using (true);

-- --------------------------------------------------------- evaluaciones (RLS)

drop policy evaluaciones_admin on evaluaciones;

create policy evaluaciones_select on evaluaciones
  for select to authenticated
  using (es_super_admin() or evaluador_id = cargo_actual() or cargo_id = cargo_actual());

create policy evaluaciones_insert on evaluaciones
  for insert to authenticated
  with check (es_super_admin() or (evaluador_id = cargo_actual() and es_evaluador_de(cargo_id)));

create policy evaluaciones_update on evaluaciones
  for update to authenticated
  using (es_super_admin() or evaluador_id = cargo_actual())
  with check (es_super_admin() or evaluador_id = cargo_actual());
-- Sin política de delete: una nota se corrige por update, no se borra
-- (mismo criterio que tareas/solicitudes_ayuda).

-- --------------------------------------------------- validación de negocio

-- Mismo molde que fn_toma_voluntaria_tarea (Bloque A) / fn_transicion_solicitud_ayuda
-- (Bloque B): RLS decide ampliamente quién puede tocar una fila, el trigger
-- decide qué cambios son legales.
create or replace function fn_validar_evaluacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if es_super_admin() then
    return new;
  end if;

  if new.evaluador_id is distinct from cargo_actual() then
    raise exception 'Solo puedes registrar evaluaciones como tú mismo.' using errcode = '42501';
  end if;

  if not es_evaluador_de(new.cargo_id) then
    raise exception 'No eres el evaluador asignado de ese cargo.' using errcode = '42501';
  end if;

  if exists (select 1 from cortes_evaluacion co where co.id = new.corte_id and co.cerrado) then
    raise exception 'Este corte ya está cerrado.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    new.corte_id is distinct from old.corte_id
    or new.cargo_id is distinct from old.cargo_id
    or new.evaluador_id is distinct from old.evaluador_id
    or new.criterio_id is distinct from old.criterio_id
  ) then
    raise exception 'Al corregir una evaluación solo puede cambiar la puntuación o el comentario.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_validar_evaluacion
  before insert or update on evaluaciones
  for each row execute function fn_validar_evaluacion();

revoke execute on function fn_validar_evaluacion() from public, anon, authenticated;

-- ------------------------------------------------------------------ cargos (RLS)

-- cargos_select_rama (0003) solo sigue superior_actual()/es_descendiente() —
-- nunca evaluador_id. Hoy ambos siempre coinciden, pero toda la razón de
-- ser de este bloque es dejarlos divergir: sin esto, un evaluador cuyo
-- evaluador_id diverja de la jerarquía vería su RLS de evaluaciones
-- funcionar pero el selector de "cargos que evalúo" vacío.
create policy cargos_select_evaluador on cargos
  for select to authenticated
  using (evaluador_id = cargo_actual());
