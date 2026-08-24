-- 0033 — Grupos de trabajo (Bloque E): a qué subsecretaría/comisión
-- pertenece un grupo, dónde y cuándo opera, y qué cargos son sus
-- miembros. Reemplaza el campo libre "lugar" del check-in como fuente
-- estructurada de "adónde debo ir".

create table grupos_trabajo (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  subsecretaria_id  uuid references subsecretarias(id),
  comision_id       uuid references comisiones(id),
  espacio_id        uuid not null references espacios(id),
  hora_inicio       time not null,
  hora_fin          time not null,
  activo            boolean not null default true,
  creado_por        uuid references cargos(id),
  creado_en         timestamptz not null default now(),
  constraint grupos_trabajo_una_sola_rama_check check (
    (subsecretaria_id is not null and comision_id is null)
    or (subsecretaria_id is null and comision_id is not null)
  )
);

create index idx_grupos_trabajo_subsecretaria on grupos_trabajo(subsecretaria_id);
create index idx_grupos_trabajo_comision on grupos_trabajo(comision_id);

alter table grupos_trabajo enable row level security;

-- Visible a todos los autenticados, igual que subsecretarias_select /
-- comisiones_select: un voluntario necesita poder resolver el nombre de
-- su propio grupo desde asistencia.js.
create policy grupos_trabajo_select on grupos_trabajo
  for select to authenticated using (true);

-- ------------------------------------------------------- puede_gestionar_rama

-- cargos.subsecretaria_id/comision_id puede estar poblado en CUALQUIER
-- cargo de la rama (denormalizado hacia abajo), no solo en el del
-- subsecretario, y es_descendiente() es auto-inclusivo — sin restringir a
-- tipo='subsecretario' esta función dejaría que un coordinador o incluso
-- un voluntario se autorizara a sí mismo para gestionar los grupos de su
-- propia rama. tipo='subsecretario' es el único tipo que representa
-- "dueño de la rama": un coordinador/voluntario nunca lo es, y bajando
-- desde ellos nunca se alcanza al subsecretario (su ascendiente).
create or replace function puede_gestionar_rama(p_subsecretaria_id uuid, p_comision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select es_super_admin() or exists (
    select 1 from cargos c
    where c.tipo = 'subsecretario'
      and (
        (p_subsecretaria_id is not null and c.subsecretaria_id = p_subsecretaria_id)
        or (p_comision_id is not null and c.comision_id = p_comision_id)
      )
      and es_descendiente(c.id)
  );
$$;

grant execute on function puede_gestionar_rama(uuid, uuid) to authenticated;
-- CREATE FUNCTION otorga EXECUTE a PUBLIC por defecto — sin este revoke,
-- anon también puede invocar el RPC directamente (inofensivo en la
-- práctica, ya que cargo_actual() da null para anon y la función siempre
-- resuelve false, pero rompe la simetría con es_descendiente()/
-- puede_asignar(), que sí lo tienen revocado).
revoke execute on function puede_gestionar_rama(uuid, uuid) from public, anon;

create policy grupos_trabajo_escritura on grupos_trabajo
  for all to authenticated
  using (puede_gestionar_rama(subsecretaria_id, comision_id))
  with check (puede_gestionar_rama(subsecretaria_id, comision_id));

-- ------------------------------------------------------------- cargos.grupo_trabajo_id

-- Un cargo pertenece a lo sumo un grupo (0..1). "Tiene miembros" es
-- simplemente `select * from cargos where grupo_trabajo_id = X` — no hace
-- falta tabla de unión.
alter table cargos add column grupo_trabajo_id uuid references grupos_trabajo(id) on delete set null;
create index idx_cargos_grupo_trabajo on cargos(grupo_trabajo_id);

-- Un cargo solo puede unirse a un grupo de su misma subsecretaría/comisión
-- — sibling de fn_validar_estructura_cargo (0030): mismo estilo, concern
-- separado. Sin esto, nada impediría meter un cargo de la comisión CTD en
-- un grupo de la comisión PNUD.
create or replace function fn_validar_grupo_cargo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grupo grupos_trabajo%rowtype;
begin
  if new.grupo_trabajo_id is null then
    return new;
  end if;

  select * into v_grupo from grupos_trabajo where id = new.grupo_trabajo_id;
  if not found then
    raise exception 'El grupo de trabajo indicado no existe.' using errcode = '23503';
  end if;

  if v_grupo.subsecretaria_id is distinct from new.subsecretaria_id
     or v_grupo.comision_id is distinct from new.comision_id then
    raise exception 'El cargo solo puede pertenecer a un grupo de trabajo de su misma subsecretaría o comisión.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_validar_grupo_cargo
  before insert or update on cargos
  for each row execute function fn_validar_grupo_cargo();

revoke execute on function fn_validar_grupo_cargo() from public, anon, authenticated;

-- ------------------------------------------------------------- asistencia.grupo_trabajo_id

-- `lugar` se conserva sin tocar (histórico + posible override futuro);
-- solo deja de poblarse desde el formulario de check-in nuevo.
alter table asistencia add column grupo_trabajo_id uuid references grupos_trabajo(id) on delete set null;
create index idx_asistencia_grupo_trabajo on asistencia(grupo_trabajo_id);
