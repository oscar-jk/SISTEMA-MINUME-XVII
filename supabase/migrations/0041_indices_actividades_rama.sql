-- 0041 — Bloque C (continuación): índices de cobertura para
-- actividades.subsecretaria_id/comision_id (0039).
--
-- Encontrado al revisar los advisors después de implementar: el mismo par
-- de columnas ya tiene índice en cargos (idx_cargos_subsecretaria/comision,
-- 0030) y en grupos_trabajo (idx_grupos_trabajo_subsecretaria/comision,
-- 0033) — 0039 rompió ese patrón. Mismo tratamiento aquí.

create index idx_actividades_subsecretaria on actividades(subsecretaria_id);
create index idx_actividades_comision on actividades(comision_id);
