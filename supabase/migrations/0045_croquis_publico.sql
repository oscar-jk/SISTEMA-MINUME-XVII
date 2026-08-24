-- 0045 — Bloque H: croquis público — lectura de `espacios` sin sesión.
--
-- Mismo tratamiento que regionales_lectura_publica (0029): política
-- aditiva a la de `authenticated` (espacios_select, 0003), que sigue
-- intacta. No tiene nada sensible — nombres, posiciones y capacidades de
-- salones ya visibles físicamente en el evento. Sin política de escritura
-- para `anon`: espacios_escritura sigue exigiendo puede_asignar().
--
-- tipos_espacio/estados_espacio no ganan política nueva: plano-editor.js
-- no usa esas columnas en absoluto, y el fetch público las omite.

create policy espacios_select_publico on espacios
  for select to anon using (true);
