-- 0037 — Bloque B: cierra tres fugas de visibilidad cruzada de rama, y añade
-- solicitudes de ayuda. Un solo archivo: ninguna de las dos partes exige
-- coordinar un despliegue de frontend (a diferencia de 0030/0032, que
-- renombraban columnas que el frontend en producción todavía leía) — aquí
-- solo se añaden columnas/tablas y se acotan políticas permisivas
-- adicionales, compatible con el frontend actual sin cambios obligatorios.
-- Además, la nueva función es_gestor_de_rama() (sección 1) la reutiliza
-- directamente la política de inserción de solicitudes_ayuda (sección 5):
-- un solo entregable, mismo criterio que 0035.

-- ============================================================
-- 1. es_gestor_de_rama() — tier reutilizable para el resto del archivo
-- ============================================================
-- Espejo exacto de puedeGestionarRamas(sesion) en permisos.js: super_admin,
-- sg, sga, sgl, subsecretario — NO coordinador. Distinto de puede_asignar()
-- (que sí incluye coordinador) y de puede_gestionar_rama(sub_id, com_id)
-- (que exige además que la rama coincida) — este es el "¿administra ALGUNA
-- rama?" genérico que necesitan las políticas de solo-lectura de catálogo.
create or replace function es_gestor_de_rama()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select es_super_admin() or exists (
    select 1 from cargos c
    where c.id = cargo_actual()
      and c.tipo in ('sg', 'sga', 'sgl', 'subsecretario')
  );
$$;

grant execute on function es_gestor_de_rama() to authenticated;
revoke execute on function es_gestor_de_rama() from public, anon;

-- ============================================================
-- 2. personas_select_sin_cargo — cierra la fuga org-wide, conserva la
--    recuperación de la propia creación a medio terminar
-- ============================================================
-- Opción (b), no (a): un coordinador que cree una persona y falle el paso
-- de asignar cargo (crearPersonaYAsignar en admin-personas.js,
-- crearPerfilAltoNivel en admin-desarrollador.js) sigue pudiendo verla y
-- terminar el flujo — la razón original de 0022 — sin reabrir la fuga
-- org-wide para huérfanos ajenos. creada_por sigue el mismo patrón que
-- tareas.creada_por / grupos_trabajo.creado_por.
--
-- creada_por se fija por trigger, no se confía en el cliente: a diferencia
-- de creada_por/creado_por en tareas/grupos_trabajo (puramente informativos,
-- nunca leídos por ninguna política RLS), aquí SÍ es la base de una
-- decisión de autorización — más vale que el servidor lo fije siempre él
-- mismo a que dependa de que admin-personas.js/admin-desarrollador.js
-- recuerden mandarlo. Huérfanos preexistentes (antes de esta migración)
-- quedan con creada_por null: solo recuperables por es_gestor_de_rama(),
-- consistente con el cierre de la fuga (no una regresión nueva).
alter table personas add column creada_por uuid references cargos(id) on delete set null;

create or replace function fn_fijar_creador_persona()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.creada_por := cargo_actual();
  return new;
end;
$$;

create trigger trg_fijar_creador_persona
  before insert on personas
  for each row execute function fn_fijar_creador_persona();

revoke execute on function fn_fijar_creador_persona() from public, anon, authenticated;

drop policy personas_select_sin_cargo on personas;
create policy personas_select_sin_cargo on personas
  for select to authenticated
  using (
    not exists (select 1 from cargos c where c.persona_id = personas.id)
    and (es_gestor_de_rama() or creada_por = cargo_actual())
  );

-- ============================================================
-- 3. subsecretarias_select / comisiones_select — cierra el catálogo
--    abierto, preserva "siempre veo mi propia rama" (embeds de sesion.js,
--    grupos-trabajo.js, admin-personas.js, organigrama.js)
-- ============================================================
-- CRÍTICO: subsecretarias_escritura / comisiones_escritura (0010/0030) son
-- "for all" con using(puede_asignar()) — en Postgres el using de una
-- política FOR ALL también se aplica a SELECT, como política permisiva
-- ADICIONAL. Si solo se reemplazara *_select, la fuga no se cerraría de
-- verdad: bajaría de "todos" a "puede_asignar()", que sigue incluyendo
-- coordinador — justo el tier que este arreglo busca excluir. Se dividen
-- en insert/update/delete separadas, misma autoridad de escritura exacta,
-- sin el efecto secundario sobre SELECT.
drop policy subsecretarias_select on subsecretarias;
create policy subsecretarias_select on subsecretarias
  for select to authenticated
  using (
    es_gestor_de_rama()
    or id = (select c.subsecretaria_id from cargos c where c.id = cargo_actual())
  );

drop policy subsecretarias_escritura on subsecretarias;
create policy subsecretarias_insert on subsecretarias
  for insert to authenticated with check (puede_asignar());
create policy subsecretarias_update on subsecretarias
  for update to authenticated using (puede_asignar()) with check (puede_asignar());
create policy subsecretarias_delete on subsecretarias
  for delete to authenticated using (puede_asignar());

drop policy comisiones_select on comisiones;
create policy comisiones_select on comisiones
  for select to authenticated
  using (
    es_gestor_de_rama()
    or id = (select c.comision_id from cargos c where c.id = cargo_actual())
  );

drop policy comisiones_escritura on comisiones;
create policy comisiones_insert on comisiones
  for insert to authenticated with check (puede_asignar());
create policy comisiones_update on comisiones
  for update to authenticated using (puede_asignar()) with check (puede_asignar());
create policy comisiones_delete on comisiones
  for delete to authenticated using (puede_asignar());

-- ============================================================
-- 4. acreditados_select — restringe a puede_asignar(), decisión ya tomada
--    por el usuario. CAMBIO OPERATIVO REAL: un voluntario simple en la
--    puerta pierde la consulta de nombre/foto/estado de un delegado — el
--    comentario original de 0028 documenta que esa apertura era a propósito
--    para ese caso de uso. Ningún "for all" involucrado aquí: acreditados_
--    update / acreditados_delete ya eran políticas separadas por comando,
--    así que este es un cambio de una sola línea, sin el efecto colateral
--    de la sección 3.
drop policy acreditados_select on acreditados;
create policy acreditados_select on acreditados
  for select to authenticated using (puede_asignar());
-- acreditados_salud_select / acreditados_salud_update: sin cambios, ya
-- tienen su propio candado por acceso_salud_acreditacion, no depende de
-- acreditados_select ni de puede_asignar().

-- ============================================================
-- 5. solicitudes_ayuda — greenfield
-- ============================================================

create type estado_solicitud_ayuda as enum ('pendiente', 'atendida', 'descartada');

create table solicitudes_ayuda (
  id                              uuid primary key default gen_random_uuid(),
  solicitante_cargo_id            uuid not null references cargos(id) on delete restrict,
  -- on delete restrict, no set null: si una subsecretaría/comisión se
  -- borrara mientras hay una solicitud pendiente dirigida a ella, un "set
  -- null" convertiría en silencio una solicitud DIRIGIDA en una de
  -- "escala mi propia cadena" (ambos null == ese significado) — un cambio
  -- de a quién le llega, disparado por un borrado en otra tabla. Restrict
  -- lo impide de raíz.
  destinatario_subsecretaria_id   uuid references subsecretarias(id) on delete restrict,
  destinatario_comision_id        uuid references comisiones(id) on delete restrict,
  titulo                          text not null,
  descripcion                     text,
  estado                          estado_solicitud_ayuda not null default 'pendiente',
  respuesta                       text,
  atendida_por                    uuid references cargos(id) on delete set null,
  creada_en                       timestamptz not null default now(),
  atendida_en                     timestamptz,
  constraint solicitudes_ayuda_una_sola_rama_check check (
    not (destinatario_subsecretaria_id is not null and destinatario_comision_id is not null)
  )
);

create index idx_solicitudes_ayuda_solicitante on solicitudes_ayuda(solicitante_cargo_id, estado);
create index idx_solicitudes_ayuda_destinatario_subsecretaria
  on solicitudes_ayuda(destinatario_subsecretaria_id) where destinatario_subsecretaria_id is not null;
create index idx_solicitudes_ayuda_destinatario_comision
  on solicitudes_ayuda(destinatario_comision_id) where destinatario_comision_id is not null;
create index idx_solicitudes_ayuda_estado on solicitudes_ayuda(estado);

alter table solicitudes_ayuda enable row level security;

-- ¿Puede el usuario actual atender (ver/resolver) esta solicitud? Dos rutas
-- disjuntas según si tiene destino explícito:
--  · Sin destino (ambos null): la cadena de supervisión del solicitante
--    hacia arriba — es_ascendiente_de(solicitante_cargo_id), auto-inclusiva
--    a propósito (ver nota de auto-resolución en el trigger, sección 5).
--  · Con destino: puede_gestionar_rama() sobre ESA rama específica, sin
--    relación con la cadena del solicitante — puede ser gente que nunca lo
--    supervisó.
create or replace function puede_atender_solicitud_ayuda(
  p_solicitante_cargo_id uuid,
  p_destinatario_subsecretaria_id uuid,
  p_destinatario_comision_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select es_super_admin() or (
    case
      when p_destinatario_subsecretaria_id is not null or p_destinatario_comision_id is not null
        then puede_gestionar_rama(p_destinatario_subsecretaria_id, p_destinatario_comision_id)
      else es_ascendiente_de(p_solicitante_cargo_id)
    end
  );
$$;

grant execute on function puede_atender_solicitud_ayuda(uuid, uuid, uuid) to authenticated;
revoke execute on function puede_atender_solicitud_ayuda(uuid, uuid, uuid) from public, anon;

create policy solicitudes_ayuda_select on solicitudes_ayuda
  for select to authenticated
  using (
    solicitante_cargo_id = cargo_actual()
    or puede_atender_solicitud_ayuda(solicitante_cargo_id, destinatario_subsecretaria_id, destinatario_comision_id)
  );

-- Cualquiera puede pedir ayuda para sí mismo. Dirigirla a una rama ajena
-- exige es_gestor_de_rama() — un coordinador puede pedir ayuda, pero no
-- puede "pedir prestados 3 voluntarios de Protocolo" en nombre de su rama.
-- No se acepta un insert que llegue ya "resuelto": bloquea fabricar una
-- solicitud con historial de atención falso desde el primer momento.
create policy solicitudes_ayuda_insert on solicitudes_ayuda
  for insert to authenticated
  with check (
    solicitante_cargo_id = cargo_actual()
    and estado = 'pendiente'
    and respuesta is null
    and atendida_por is null
    and atendida_en is null
    and (
      (destinatario_subsecretaria_id is null and destinatario_comision_id is null)
      or es_gestor_de_rama()
    )
  );

-- Amplia a propósito (solicitante o quien puede atender): QUÉ columnas
-- puede tocar cada uno lo decide fn_transicion_solicitud_ayuda, no esta
-- política — mismo patrón que tareas_update / fn_toma_voluntaria_tarea.
create policy solicitudes_ayuda_update on solicitudes_ayuda
  for update to authenticated
  using (
    solicitante_cargo_id = cargo_actual()
    or puede_atender_solicitud_ayuda(solicitante_cargo_id, destinatario_subsecretaria_id, destinatario_comision_id)
  )
  with check (
    solicitante_cargo_id = cargo_actual()
    or puede_atender_solicitud_ayuda(solicitante_cargo_id, destinatario_subsecretaria_id, destinatario_comision_id)
  );
-- Sin política de DELETE, a propósito: los estados terminales (atendida /
-- descartada) bastan, mismo criterio que tareas.

-- Cinturón además del tirante: RLS ya decidió QUÉ filas puede tocar cada
-- quien; este trigger decide con precisión QUÉ CAMBIOS son legales en esa
-- fila, igual que fn_toma_voluntaria_tarea (0035).
create or replace function fn_transicion_solicitud_ayuda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  yo uuid := cargo_actual();
begin
  if es_super_admin() then
    return new;
  end if;

  if old.estado in ('atendida', 'descartada') then
    raise exception 'Esta solicitud ya está resuelta; crea una nueva si necesitas ayuda otra vez.'
      using errcode = '42501';
  end if;

  -- El chequeo de identidad-como-solicitante va PRIMERO y es excluyente:
  -- es_ascendiente_de() es auto-inclusiva, así que para una solicitud sin
  -- destino explícito puede_atender_solicitud_ayuda(mi_propio_id, null, null)
  -- también daría true para mí mismo. Si este bloque no fuera el primero
  -- (o si se usara un solo "elsif" sin exclusión), un solicitante podría
  -- resolver su propia solicitud escalada — exactamente lo que la función
  -- existe para evitar. Aquí, ser el solicitante SIEMPRE cae en esta rama,
  -- nunca en la de "atender", sin importar el solape.
  if old.solicitante_cargo_id = yo then
    if new.estado is distinct from old.estado
       or new.respuesta is distinct from old.respuesta
       or new.atendida_por is distinct from old.atendida_por
       or new.atendida_en is distinct from old.atendida_en
       or new.solicitante_cargo_id is distinct from old.solicitante_cargo_id
       or new.destinatario_subsecretaria_id is distinct from old.destinatario_subsecretaria_id
       or new.destinatario_comision_id is distinct from old.destinatario_comision_id
       or new.creada_en is distinct from old.creada_en
    then
      raise exception 'Mientras está pendiente, solo puedes editar el título o la descripción de tu propia solicitud.'
        using errcode = '42501';
    end if;

  elsif puede_atender_solicitud_ayuda(old.solicitante_cargo_id, old.destinatario_subsecretaria_id, old.destinatario_comision_id) then
    if new.titulo is distinct from old.titulo
       or new.descripcion is distinct from old.descripcion
       or new.solicitante_cargo_id is distinct from old.solicitante_cargo_id
       or new.destinatario_subsecretaria_id is distinct from old.destinatario_subsecretaria_id
       or new.destinatario_comision_id is distinct from old.destinatario_comision_id
       or new.creada_en is distinct from old.creada_en
    then
      raise exception 'Al atender una solicitud solo puedes cambiar su estado y tu respuesta, ningún otro campo.'
        using errcode = '42501';
    end if;

    if new.estado is distinct from old.estado then
      if new.estado not in ('atendida', 'descartada') then
        raise exception 'Una solicitud pendiente solo puede pasar a atendida o descartada.'
          using errcode = '23514';
      end if;
      -- Se fijan en el servidor, no se confía en lo que mande el cliente:
      -- mismo motivo que creada_por en personas (sección 2).
      new.atendida_por := yo;
      new.atendida_en := now();
    else
      -- atendida_por/atendida_en solo pueden cambiar JUNTO con el estado
      -- (rama de arriba) — nunca por separado. Sin este bloque, alguien
      -- podría fijar atendida_por/atendida_en a cualquier valor mientras
      -- el estado sigue en 'pendiente': inofensivo para la autoridad real
      -- (no escala privilegios en ninguna otra tabla), pero deja datos
      -- inconsistentes — una solicitud "pendiente" con una atención
      -- fantasma. Encontrado revisando el borrador de este trigger.
      if new.atendida_por is distinct from old.atendida_por
         or new.atendida_en is distinct from old.atendida_en then
        raise exception 'atendida_por y atendida_en solo cambian junto con el estado.'
          using errcode = '42501';
      end if;
    end if;

  else
    -- RLS ya debería haber impedido llegar aquí (using/with check exigen
    -- ser el solicitante o puede_atender_solicitud_ayuda) — inalcanzable en
    -- circunstancias normales, defensa en profundidad si RLS cambiara.
    raise exception 'No tienes autoridad sobre esta solicitud.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_transicion_solicitud_ayuda
  before update on solicitudes_ayuda
  for each row execute function fn_transicion_solicitud_ayuda();

revoke execute on function fn_transicion_solicitud_ayuda() from public, anon, authenticated;
