-- 0044 — Bloque F (continuación): índices de cobertura para las columnas
-- de rama nueva de 0043.
--
-- corte_id ya queda cubierto porque es la columna líder de
-- evaluaciones_unica (0043); cargo_id/evaluador_id/criterio_id no, y
-- cargos.evaluador_id tampoco tenía índice — mismo patrón que actividades
-- (0039/0041). cargos.evaluador_id es el más importante de los cuatro: es
-- exactamente la columna que fetchCargosQueEvaluo() filtra para poblar el
-- selector de "cargos que evalúo" en evaluaciones.js.

create index idx_cargos_evaluador on cargos(evaluador_id);
create index idx_evaluaciones_cargo on evaluaciones(cargo_id);
create index idx_evaluaciones_evaluador on evaluaciones(evaluador_id);
create index idx_evaluaciones_criterio on evaluaciones(criterio_id);
