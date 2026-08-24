-- 0034 — Bitácora en creación de cargos y personas. General, no exclusivo
-- del panel de desarrollador: cargos/personas se crean desde varias
-- pantallas (admin-personas.js todos los días, y ahora también
-- admin-desarrollador.js) y ninguna quedaba auditada — solo lo estaba el
-- UPDATE de cargos (trg_validar_cambio_cargo, 0020/0027/0030), nunca el
-- INSERT.

create or replace function fn_bitacora_cargo_creado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform fn_registrar_bitacora('cargos', new.id, 'cargo_creado', jsonb_build_object(
    'nombre', new.nombre, 'tipo', new.tipo, 'division', new.division,
    'superior_id', new.superior_id, 'persona_id', new.persona_id,
    'subsecretaria_id', new.subsecretaria_id, 'comision_id', new.comision_id
  ));
  return new;
end;
$$;

create trigger trg_bitacora_cargo_creado
  after insert on cargos
  for each row execute function fn_bitacora_cargo_creado();

revoke execute on function fn_bitacora_cargo_creado() from public, anon, authenticated;

create or replace function fn_bitacora_persona_creada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform fn_registrar_bitacora('personas', new.id, 'persona_creada', jsonb_build_object(
    'nombre', new.nombre, 'apellido', new.apellido, 'correo', new.correo
  ));
  return new;
end;
$$;

create trigger trg_bitacora_persona_creada
  after insert on personas
  for each row execute function fn_bitacora_persona_creada();

revoke execute on function fn_bitacora_persona_creada() from public, anon, authenticated;
