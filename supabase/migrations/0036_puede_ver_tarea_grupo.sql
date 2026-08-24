-- 0036 — Bloque A, corrección post-verificación en navegador: puede_ver_tarea()
-- gobierna avances_select (0003) e historial_reasignacion_select (0012),
-- pero 0035 solo extendió tareas_select_rama con la rama de grupo — dejó a
-- puede_ver_tarea() sin actualizar. Efecto real, encontrado probando en
-- vivo: un miembro de grupo veía la fila de la tarea (por la rama nueva de
-- tareas_select_rama) pero no su historial de avances ni de reasignación
-- (ambos vacíos en pantalla sin ningún error, ya que ambas consultas
-- devuelven [] silenciosamente cuando RLS no encuentra filas). Se corrige
-- añadiendo la misma rama de grupo, reutilizando grupo_trabajo_actual() de
-- 0035.
create or replace function puede_ver_tarea(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select es_super_admin() or exists (
    select 1 from tareas x
    where x.id = t
      and (es_descendiente(x.responsable_cargo_id)
        or es_descendiente(x.supervisor_cargo_id)
        or (x.grupo_trabajo_id is not null and x.grupo_trabajo_id = grupo_trabajo_actual()))
  );
$$;
-- create or replace function: mismo nombre y firma, así que grant/revoke de
-- 0002 (grant a authenticated, sin revoke explícito histórico — puede_ver_tarea
-- ya aparecía en el baseline de advisors) siguen vigentes sin tocarlos.
