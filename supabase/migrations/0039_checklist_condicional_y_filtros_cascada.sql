-- 0039 — Bloque C: checklist condicional y filtros en cascada.
--
-- Dos piezas que se componen en una sola historia (ver README):
-- 1) actividades.subsecretaria_id/comision_id — mismo molde que
--    tolerancias_puntualidad (0030): a lo sumo una de las dos, ambas null
--    es legal y es el caso frecuente ("actividad general del evento"). A
--    diferencia de grupos_trabajo (0033), que exige exactamente una — aquí
--    "sin rama" es un estado real, no un dato faltante.
-- 2) estado_tarea.no_aplica ya existe desde 0001 y ya tiene su regla de
--    autoridad en fn_transicion_estado_tarea (0004) — esta migración no
--    toca esa función, solo el frontend deja de omitir el botón.

alter table actividades add column subsecretaria_id uuid references subsecretarias(id) on delete set null;
alter table actividades add column comision_id uuid references comisiones(id) on delete set null;

alter table actividades add constraint actividades_una_sola_rama_check
  check (not (subsecretaria_id is not null and comision_id is not null));

-- Sin cambios de RLS: actividades_select sigue using(true) — esta es una
-- etiqueta de categorización para el checklist, no un mecanismo de
-- visibilidad. Sin trigger de autoridad nuevo: puede_asignar() (coordinador
-- incluido) ya podía insertar/editar cualquier actividad del evento entero
-- sin acotamiento por rama; estas columnas no amplían esa superficie, solo
-- la clasifican, y hoy nada lee subsecretaria_id/comision_id para decidir
-- una autorización. Si un bloque futuro las usa para decidir algo real
-- (quién despliega tareas de una actividad, por ejemplo), ese es el
-- momento de envolver la escritura en un trigger puede_gestionar_rama()
-- -gateado (molde de fn_validar_estructura_cargo / fn_validar_grupo_cargo)
-- — no antes.
