-- 0025 — current_date_local()/current_time_local() (0019) quedaron sin
-- `set search_path`, a diferencia de toda otra función del proyecto. El
-- linter de Supabase lo marca (function_search_path_mutable); se corrige
-- por consistencia con el resto del código, aunque estas dos no tocan
-- ninguna tabla.

create or replace function current_date_local()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Santo_Domingo')::date;
$$;

create or replace function current_time_local()
returns time
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Santo_Domingo')::time;
$$;
