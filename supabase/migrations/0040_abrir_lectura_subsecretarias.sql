-- 0040 — Bloque C (continuación): abre subsecretarias_select a using(true),
-- igual que comisiones_select desde 0030.
--
-- Encontrado implementando 0039: el nuevo picker de rama en el formulario
-- de nueva actividad (calendario.js) debe funcionar para cualquier
-- puede_asignar() — coordinador incluido, ya que ese rol puede insertar y
-- editar cualquier actividad del evento sin acotamiento de rama desde
-- siempre (actividades_insert/update, 0003). Pero subsecretarias_select
-- (desde el Bloque 0, 0030/0033) restringía la lectura a
-- es_gestor_de_rama() (sg/sga/sgl/subsecretario/super_admin) o la
-- subsecretaría propia — dejando la mitad SG/SGL del picker vacía en
-- silencio para un coordinador (comisiones ya era using(true) desde 0030,
-- por eso la mitad SGA sí funcionaba). Mismo tratamiento para las dos
-- tablas de catálogo de rama: ninguna es sensible, ambas son solo nombres
-- de subsecretaría/comisión.

drop policy subsecretarias_select on subsecretarias;
create policy subsecretarias_select on subsecretarias
  for select to authenticated using (true);
