-- 0027 — Prepara el terreno para acreditación de delegados (0028):
-- catálogo de regionales educativas (con su técnico regional y receptor
-- de invitados, tal como los pide el formulario real que se está
-- integrando) y el permiso de lectura de datos de salud, que no encaja
-- en ningún tipo_cargo existente — es una capacidad transversal (puede
-- caer en cualquier cargo, típicamente uno de enfermería o coordinación
-- médica), no un nivel de la jerarquía.

create table regionales (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text unique not null,
  tecnico_nombre     text,
  tecnico_telefono   text,
  receptor_nombre    text,
  receptor_telefono  text,
  activa             boolean not null default true
);

alter table regionales enable row level security;

create policy regionales_select on regionales
  for select to authenticated using (true);

create policy regionales_escritura on regionales
  for all to authenticated
  using (puede_asignar())
  with check (puede_asignar());

insert into regionales (codigo) select 'R' || g from generate_series(1, 18) as g;

-- Se llena desde admin-catalogos.html — sin datos reales de técnicos ni
-- receptores todavía; sembrar nombres de un prototipo aquí los volvería
-- indistinguibles de contactos reales en la base de producción.

alter table cargos add column acceso_salud_acreditacion boolean not null default false;

-- fn_validar_cambio_cargo (0020) ya bloquea que alguien que no sea super
-- admin cambie tipo/superior_id/evaluador_id de un cargo, para evitar
-- auto-escalada. acceso_salud_acreditacion es igual de sensible (abre
-- diagnósticos médicos de menores) y se agrega a esa misma protección.
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
       or new.evaluador_id is distinct from old.evaluador_id
       or new.acceso_salud_acreditacion is distinct from old.acceso_salud_acreditacion then
      raise exception 'Solo el super admin puede cambiar el tipo, el superior, el evaluador o el acceso a datos de salud de un cargo.'
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
     or new.persona_id is distinct from old.persona_id
     or new.acceso_salud_acreditacion is distinct from old.acceso_salud_acreditacion then
    perform fn_registrar_bitacora('cargos', new.id, 'cambio_estructural', jsonb_build_object(
      'tipo_antes', old.tipo, 'tipo_despues', new.tipo,
      'superior_antes', old.superior_id, 'superior_despues', new.superior_id,
      'evaluador_antes', old.evaluador_id, 'evaluador_despues', new.evaluador_id,
      'persona_antes', old.persona_id, 'persona_despues', new.persona_id,
      'acceso_salud_antes', old.acceso_salud_acreditacion, 'acceso_salud_despues', new.acceso_salud_acreditacion
    ));
  end if;

  return new;
end;
$$;
