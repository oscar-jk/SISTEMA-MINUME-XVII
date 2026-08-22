-- Los triggers no se invocan por RPC (retornan `trigger`, no un tipo de dato
-- normal), pero el grant implicito de PUBLIC igual dispara el linter. Se cierra.
revoke execute on function fn_progreso_desde_avance() from public, anon, authenticated;
revoke execute on function fn_transicion_estado_tarea() from public, anon, authenticated;

-- auth.uid() evaluado una vez por consulta, no por fila.
drop policy usuarios_select_propio on usuarios;
create policy usuarios_select_propio on usuarios
  for select to authenticated
  using (id = (select auth.uid()) or es_super_admin());
