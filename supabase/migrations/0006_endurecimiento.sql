-- Cierra dos advertencias del linter de seguridad:
-- 1) fn_avance_inmutable sin search_path fijo.
-- 2) Las funciones auxiliares quedaron ejecutables por PUBLIC (incluye anon)
--    por el grant implicito de Postgres al crearlas; se revoca y se deja
--    solo a `authenticated`, que es quien las necesita.

create or replace function fn_avance_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Los avances son inmutables: no se editan ni se borran.'
    using errcode = '42501';
end;
$$;

revoke execute on function cargo_actual() from public;
revoke execute on function es_super_admin() from public;
revoke execute on function es_descendiente(uuid) from public;
revoke execute on function es_ascendiente_de(uuid) from public;
revoke execute on function puede_asignar() from public;
revoke execute on function puede_ver_tarea(uuid) from public;
revoke execute on function superior_actual() from public;
revoke execute on function persona_visible(uuid) from public;
revoke execute on function fn_desplegar_actividad(uuid, uuid, text[]) from public;
revoke execute on function fn_refechar_rango(date, date, integer) from public;

revoke execute on function cargo_actual() from anon;
revoke execute on function es_super_admin() from anon;
revoke execute on function es_descendiente(uuid) from anon;
revoke execute on function es_ascendiente_de(uuid) from anon;
revoke execute on function puede_asignar() from anon;
revoke execute on function puede_ver_tarea(uuid) from anon;
revoke execute on function superior_actual() from anon;
revoke execute on function persona_visible(uuid) from anon;
revoke execute on function fn_desplegar_actividad(uuid, uuid, text[]) from anon;
revoke execute on function fn_refechar_rango(date, date, integer) from anon;
