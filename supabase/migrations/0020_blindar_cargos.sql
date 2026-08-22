-- 0020 — Corrige A1: cargos_update (0009) permite es_descendiente(id), que
-- incluye al propio cargo por diseño. Cualquier titular con puede_asignar()
-- podía hacer `update cargos set tipo='sg' where id=<su propio cargo>` y
-- ganar lectura total de bitácora (0008 premia tipo='sg'), o reescribir su
-- propio superior_id/evaluador_id, rompiendo el desacople jerarquía/
-- evaluación. No existía ningún trigger que restringiera esas columnas.
-- Este trigger no toca cargos_update (la política de "puede escribir su
-- rama" sigue siendo correcta) — solo añade la capa que faltaba: qué
-- columnas puede tocar quien no es super admin, y deja rastro en bitácora.

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
       or new.evaluador_id is distinct from old.evaluador_id then
      raise exception 'Solo el super admin puede cambiar el tipo, el superior o el evaluador de un cargo.'
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

  if new.tipo is distinct from old.tipo
     or new.superior_id is distinct from old.superior_id
     or new.evaluador_id is distinct from old.evaluador_id
     or new.persona_id is distinct from old.persona_id then
    perform fn_registrar_bitacora('cargos', new.id, 'cambio_estructural', jsonb_build_object(
      'tipo_antes', old.tipo, 'tipo_despues', new.tipo,
      'superior_antes', old.superior_id, 'superior_despues', new.superior_id,
      'evaluador_antes', old.evaluador_id, 'evaluador_despues', new.evaluador_id,
      'persona_antes', old.persona_id, 'persona_despues', new.persona_id
    ));
  end if;

  return new;
end;
$$;

create trigger trg_validar_cambio_cargo
  before update on cargos
  for each row execute function fn_validar_cambio_cargo();

revoke execute on function fn_validar_cambio_cargo() from public, anon, authenticated;
