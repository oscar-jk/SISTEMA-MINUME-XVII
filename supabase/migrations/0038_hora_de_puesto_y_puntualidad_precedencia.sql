-- 0038 — Bloque G: activa grupos_trabajo.hora_inicio (decorativa desde
-- 0033) como fuente MÁS específica de "hora de puesto", y reescribe
-- fn_calcular_puntualidad() para resolver hora programada y minutos de
-- tolerancia por una cadena real de precedencia en vez de la lógica ad hoc
-- de hoy (solo miraba la rama del cargo, nunca su grupo). Además delega la
-- escritura de tolerancias_puntualidad de rama al subsecretario dueño de
-- esa rama, y cierra dos huecos encontrados al diseñar esto:
--   1. new.grupo_trabajo_id en el insert de asistencia es client-supplied
--      y asistencia_insert (0015) nunca lo valida contra la membresía real
--      del cargo — confiar en él para el tier 1 dejaría reclamar la
--      hora_inicio de CUALQUIER grupo activo ajeno. Se ignora por completo
--      y se re-resuelve server-side desde cargos.grupo_trabajo_id.
--   2. La fila "default" de tolerancias_puntualidad (subsecretaria_id y
--      comision_id ambos null, reservada en 0030) nunca tuvo un índice
--      único que garantizara como máximo una — inofensivo mientras ningún
--      frontend la producía, pero este bloque es precisamente el que abre
--      un camino de UI para crearla.

-- ============================================================
-- 0. Datos huérfanos reales encontrados al aplicar esta migración
-- ============================================================
-- Las dos filas sembradas en 0016_seed_v1.sql ('Operaciones' 08:00/10min,
-- 'Academica' 08:30/15min) nunca recibieron su subsecretaria_id al
-- normalizar en 0030/0032 — quedaron con subsecretaria_id/comision_id
-- ambos null, indistinguibles hoy de la fila "default" reservada. No son
-- datos de prueba a descartar (Bloque 0 sí descartó cargos de prueba sin
-- rama a propósito, pero esto es tolerancia real ya configurada) — se
-- reubican por nombre antes de que el índice de la sección 1 las
-- convierta en el default del evento por accidente. Identificadas por sus
-- valores exactos de siembra (únicos en la tabla hoy, confirmado antes de
-- escribir este UPDATE).
update tolerancias_puntualidad
set subsecretaria_id = (select id from subsecretarias where nombre = 'Operaciones')
where subsecretaria_id is null and comision_id is null
  and hora_programada = '08:00' and tolerancia_minutos = 10;

update tolerancias_puntualidad
set subsecretaria_id = (select id from subsecretarias where nombre = 'Academica')
where subsecretaria_id is null and comision_id is null
  and hora_programada = '08:30' and tolerancia_minutos = 15;

-- ============================================================
-- 1. Como máximo una fila "default" (ver hallazgo de diseño arriba)
-- ============================================================
create unique index ux_tolerancias_default on tolerancias_puntualidad ((1))
  where subsecretaria_id is null and comision_id is null;

-- ============================================================
-- 2. fn_calcular_puntualidad() — cadena de precedencia de tres niveles
-- ============================================================
-- Tier 1 (más específico): grupo de trabajo ACTIVO real del cargo (nunca
-- new.grupo_trabajo_id — ver hallazgo de seguridad arriba) -> su
-- hora_inicio.
-- Tier 2: fila de tolerancias_puntualidad de la rama del cargo (subsecretaria_id
-- o comision_id — un cargo tiene a lo sumo una, fn_validar_estructura_cargo
-- lo garantiza) -> su hora_programada.
-- Tier 3: fila "default" (ambos null) -> su hora_programada.
-- Si NINGUNO de los tres resuelve una hora, sin cálculo (puntual /
-- minutos_tardanza quedan null) — mismo no-op que hoy, sin regresión.
--
-- tolerancia_minutos es una resolución SEPARADA, siempre por la cadena de
-- tolerancias_puntualidad (rama -> default), nunca por el grupo —
-- grupos_trabajo no tiene minutos de gracia propios. Si SÍ se resolvió un
-- horario (por cualquier tier) pero NINGUNA fila de tolerancia existe
-- (ni de rama ni default), se usan 0 minutos de gracia en vez de omitir
-- el cálculo: ya hay un horario real contra el cual comparar, y "no hay
-- tolerancia configurada todavía" no debería silenciar la detección de
-- tardanza.
create or replace function fn_calcular_puntualidad()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subsecretaria_id     uuid;
  v_comision_id          uuid;
  v_grupo_trabajo_id     uuid;
  v_hora_programada      time;
  v_tolerancia_minutos   integer;
  v_grupo                grupos_trabajo%rowtype;
  v_tolerancia_rama      tolerancias_puntualidad%rowtype;
  v_tolerancia_default   tolerancias_puntualidad%rowtype;
begin
  if new.tipo <> 'entrada' then
    return new;
  end if;

  select subsecretaria_id, comision_id, grupo_trabajo_id
    into v_subsecretaria_id, v_comision_id, v_grupo_trabajo_id
    from cargos where id = new.cargo_id;

  -- Tier 1: grupo de trabajo activo real del cargo.
  if v_grupo_trabajo_id is not null then
    select * into v_grupo from grupos_trabajo where id = v_grupo_trabajo_id and activo;
    if found then
      v_hora_programada := v_grupo.hora_inicio;
    end if;
  end if;

  -- Fila de tolerancia de rama y fila default: se resuelven siempre (no
  -- solo cuando el tier 1 falla), porque tolerancia_minutos las necesita
  -- de todos modos, sin importar de dónde salió la hora programada.
  if v_subsecretaria_id is not null then
    select * into v_tolerancia_rama from tolerancias_puntualidad where subsecretaria_id = v_subsecretaria_id;
  elsif v_comision_id is not null then
    select * into v_tolerancia_rama from tolerancias_puntualidad where comision_id = v_comision_id;
  end if;

  select * into v_tolerancia_default from tolerancias_puntualidad
    where subsecretaria_id is null and comision_id is null;

  -- Tier 2 / Tier 3: solo si el tier 1 no dio una hora.
  if v_hora_programada is null then
    if v_tolerancia_rama.hora_programada is not null then
      v_hora_programada := v_tolerancia_rama.hora_programada;
    elsif v_tolerancia_default.hora_programada is not null then
      v_hora_programada := v_tolerancia_default.hora_programada;
    end if;
  end if;

  if v_hora_programada is null then
    return new;
  end if;

  v_tolerancia_minutos := coalesce(
    v_tolerancia_rama.tolerancia_minutos,
    v_tolerancia_default.tolerancia_minutos,
    0
  );

  new.minutos_tardanza := greatest(0, extract(epoch from (new.hora - v_hora_programada)) / 60);
  new.puntual := (new.hora <= v_hora_programada + make_interval(mins => v_tolerancia_minutos));
  return new;
end;
$$;

-- create or replace function conserva el grant/revoke existente (0015:
-- revoke execute ... from public, anon, authenticated) y el trigger
-- trg_calcular_puntualidad sigue apuntando a esta función sin tocarla —
-- ninguno de los dos necesita reemitirse aquí.

-- ============================================================
-- 3. tolerancias_puntualidad: autoridad de escritura condicionada a la
--    forma de la fila
-- ============================================================
-- tolerancias_escritura (0015) era "for all" con using/with check
-- es_super_admin() — hay que dividirla en insert/update/delete separadas
-- en vez de otro "for all", por la misma razón que 0037 documenta para
-- subsecretarias/comisiones: un "for all" también se aplica a SELECT como
-- política permisiva ADICIONAL.
--
-- puede_gestionar_rama(subsecretaria_id, comision_id) (0033, sin cambios,
-- reutilizada tal cual) ya resuelve exactamente la autoridad que pide el
-- requisito 2, SIN necesitar una condición aparte de "¿es la fila
-- default?": con subsecretaria_id/comision_id ambos null, su cláusula
-- interna (p_subsecretaria_id is not null and ...) or (p_comision_id is
-- not null and ...) es false para toda fila, así que exists() es siempre
-- false y la función colapsa a es_super_admin() — exactamente "la fila
-- default es super_admin-only" sin escribirlo aparte. Para una fila de
-- rama, delega en el subsecretario dueño de esa rama (o cualquier
-- ascendiente suyo), igual que grupos_trabajo_escritura.
drop policy tolerancias_escritura on tolerancias_puntualidad;

create policy tolerancias_insert on tolerancias_puntualidad
  for insert to authenticated
  with check (puede_gestionar_rama(subsecretaria_id, comision_id));

create policy tolerancias_update on tolerancias_puntualidad
  for update to authenticated
  using (puede_gestionar_rama(subsecretaria_id, comision_id))
  with check (puede_gestionar_rama(subsecretaria_id, comision_id));
-- with check se evalúa sobre la fila NUEVA: un subsecretario de rama A no
-- puede reapuntar su propia fila a la rama B (puede_gestionar_rama(B, null)
-- exigiría ser subsecretario de B) ni "degradarla" a fila default
-- (puede_gestionar_rama(null, null) colapsa a es_super_admin()).

create policy tolerancias_delete on tolerancias_puntualidad
  for delete to authenticated
  using (puede_gestionar_rama(subsecretaria_id, comision_id));

-- tolerancias_select (0015) no cambia: using(true) sigue siendo correcto,
-- la lectura nunca fue la preocupación de este bloque.
