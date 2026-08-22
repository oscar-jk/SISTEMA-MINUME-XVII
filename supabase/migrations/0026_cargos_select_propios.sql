-- 0026 — Bug real encontrado al probar 0023 (cargo activo seleccionable):
-- cargos_select_rama (0003) solo deja ver la rama de cargo_actual() hacia
-- arriba/abajo. Para alguien con dos cargos en ramas SIN relación entre sí
-- (el caso que 0023 existe para resolver — dos roles de mesa directiva en
-- comisiones distintas), el segundo cargo era invisible incluso para la
-- propia persona: ni sesion.js podía listarlo, ni el conmutador de cargo
-- tenía nada que mostrar. Se añade una política permisiva adicional: cada
-- quien siempre ve sus propios cargos, sin importar la rama.

create policy cargos_select_propio on cargos
  for select to authenticated
  using (persona_id = (select persona_id from usuarios where id = auth.uid()));
