-- 0029 — El formulario público de acreditación (registro.html, sin
-- sesión) necesita mostrar el técnico regional y el receptor de
-- invitados de la regional elegida antes de enviar, igual que hace el
-- prototipo que se está integrando. regionales no tiene nada sensible
-- (solo códigos y contactos de coordinación ya públicos internamente),
-- así que se abre su lectura a anon — acreditados y acreditados_salud
-- siguen sin ninguna política de select/insert para anon: esas se
-- escriben únicamente desde la Edge Function con service_role.
create policy regionales_select_publico on regionales
  for select to anon using (true);
