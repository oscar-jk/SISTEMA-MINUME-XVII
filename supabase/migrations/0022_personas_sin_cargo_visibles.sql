-- 0022 — Corrige B4: personas_insert (0009) solo exige puede_asignar(), pero
-- personas_select exige persona_visible(id), que a su vez exige que la
-- persona ocupe un cargo activo. Una persona recién creada sin cargo era
-- invisible para quien acababa de crearla — en admin-personas.js se creaba,
-- se recargaba la tabla, y no aparecía. Se suma (OR, no reemplaza) una
-- política permisiva: quien puede asignar ve también las personas sin
-- ningún cargo, para poder encontrarlas y asignarles uno después.

create policy personas_select_sin_cargo on personas
  for select to authenticated
  using (
    puede_asignar()
    and not exists (select 1 from cargos c where c.persona_id = personas.id)
  );
