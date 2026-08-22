-- MINUME XVII — 0002 Funciones auxiliares
-- Todas SECURITY DEFINER con search_path fijo: necesitan leer `cargos` y
-- `usuarios` sin quedar atrapadas en la RLS que ellas mismas alimentan.

-- Cargo activo del usuario autenticado.
create or replace function cargo_actual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id
  from usuarios u
  join cargos c on c.persona_id = u.persona_id and c.activo
  where u.id = auth.uid()
  order by c.creado_en
  limit 1;
$$;

create or replace function es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select u.es_super_admin from usuarios u where u.id = auth.uid()),
    false
  );
$$;

-- ¿`cargo` está en la rama del usuario actual hacia abajo?
-- Incluye el propio cargo: cada quien ve su rama más sus propios registros.
create or replace function es_descendiente(cargo uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive rama as (
    select cargo_actual() as id
    union all
    select c.id from cargos c join rama r on c.superior_id = r.id
  )
  select cargo is not null and exists (select 1 from rama where rama.id = cargo);
$$;

-- ¿El usuario actual es `cargo` o alguno de sus ascendientes?
-- Sostiene la regla "aprobar o devolver: el supervisor de esa tarea o un
-- ascendiente suyo".
create or replace function es_ascendiente_de(cargo uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive cadena as (
    select c.id, c.superior_id from cargos c where c.id = cargo
    union all
    select c.id, c.superior_id
    from cargos c join cadena k on k.superior_id = c.id
  )
  select cargo is not null and exists (
    select 1 from cadena where cadena.id = cargo_actual()
  );
$$;

-- Quién puede crear y asignar tareas, cargar actividades y re-fechar.
create or replace function puede_asignar()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select es_super_admin() or exists (
    select 1 from cargos c
    where c.id = cargo_actual()
      and c.tipo in ('super_admin','sg','sga','sgl','subsecretario','coordinador')
  );
$$;

-- ¿El usuario actual está en la cadena de supervisión de la tarea?
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
        or es_descendiente(x.supervisor_cargo_id))
  );
$$;

grant execute on function cargo_actual, es_super_admin, es_descendiente,
  es_ascendiente_de, puede_asignar, puede_ver_tarea to authenticated;

-- Superior directo del usuario actual. Como función SECURITY DEFINER y no
-- como subconsulta dentro de la política de `cargos`: una subconsulta a
-- `cargos` en su propia política provoca recursión de RLS.
create or replace function superior_actual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.superior_id from cargos c where c.id = cargo_actual();
$$;

-- ¿La persona ocupa algún cargo visible para el usuario actual?
-- Misma razón: evita que la política de `personas` consulte `cargos` bajo RLS.
create or replace function persona_visible(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select es_super_admin() or exists (
    select 1 from cargos c
    where c.persona_id = p
      and (es_descendiente(c.id) or c.id = superior_actual())
  );
$$;

grant execute on function superior_actual, persona_visible to authenticated;
