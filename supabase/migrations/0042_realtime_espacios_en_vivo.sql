-- 0042 — Bloque D: Realtime para la pestaña "En vivo" de espacios.
--
-- actividades_select ya es `using(true)` (0003/0040), así que Postgres
-- Changes puede usarse tal cual: RLS filtra qué filas ve cada cliente sin
-- necesidad de canales privados ni políticas de realtime.messages. Único
-- cambio: sumar la tabla a la publicación que el motor de Realtime escucha.
-- Sin replica identity full: el cliente nunca lee el payload del evento,
-- solo lo usa como señal para volver a pedir actividades de hoy.

alter publication supabase_realtime add table actividades;
