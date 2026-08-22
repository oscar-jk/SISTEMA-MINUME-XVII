-- 0017 — fn_evidencia_transicion es un trigger, no una RPC: se cierra el
-- grant implícito de PUBLIC igual que en 0007 para los triggers de tareas.
revoke execute on function fn_evidencia_transicion() from public, anon, authenticated;
