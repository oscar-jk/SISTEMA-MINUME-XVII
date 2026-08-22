-- 0018 — fn_sustituir_titular y fn_purgar_evidencia_rango llaman a
-- fn_registrar_bitacora, que está deliberadamente bloqueada para
-- `authenticated` (nadie debe poder forjar entradas de bitácora a mano).
-- Como ambas RPCs eran `security invoker`, la llamada interna heredaba los
-- privilegios de quien invoca, no los del dueño de la función, y fallaba
-- con "permission denied for function fn_registrar_bitacora". Se cambian a
-- `security definer` — el chequeo explícito de permisos al inicio de cada
-- una sigue siendo la única puerta de entrada real, igual que ya hacían
-- fn_desplegar_actividad/fn_refechar_rango con sus propias reglas.

create or replace function fn_sustituir_titular(
  p_cargo uuid, p_persona_nueva uuid, p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_persona_anterior uuid;
begin
  if not (puede_asignar() and (es_super_admin() or es_descendiente(p_cargo))) then
    raise exception 'No tienes permiso para sustituir el titular de este cargo.'
      using errcode = '42501';
  end if;

  select persona_id into v_persona_anterior from cargos where id = p_cargo;

  update cargos set persona_id = p_persona_nueva where id = p_cargo;

  insert into historial_titulares_cargo
    (cargo_id, persona_anterior_id, persona_nueva_id, motivo, responsable_cargo_id)
  values (p_cargo, v_persona_anterior, p_persona_nueva, p_motivo, cargo_actual());

  perform fn_registrar_bitacora('cargos', p_cargo, 'sustitucion',
    jsonb_build_object('persona_anterior', v_persona_anterior, 'persona_nueva', p_persona_nueva, 'motivo', p_motivo));
end;
$$;

create or replace function fn_purgar_evidencia_rango(p_desde date, p_hasta date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not es_super_admin() then
    raise exception 'Solo el super admin puede purgar evidencia.' using errcode = '42501';
  end if;

  update evidencias
     set foto_path = null
   where foto_path is not null
     and creada_en::date between p_desde and p_hasta;
  get diagnostics n = row_count;

  perform fn_registrar_bitacora('evidencias', null, 'evidencia_purgada',
    jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'filas', n));

  return n;
end;
$$;

revoke execute on function fn_sustituir_titular(uuid, uuid, text) from public, anon;
grant execute on function fn_sustituir_titular(uuid, uuid, text) to authenticated;
revoke execute on function fn_purgar_evidencia_rango(date, date) from public, anon;
grant execute on function fn_purgar_evidencia_rango(date, date) to authenticated;
