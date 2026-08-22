-- 0016 — Semillas de V1: catálogos, backfill de espacios/plano, y datos de
-- prueba de evidencia y asistencia en todos los estados.

begin;

insert into subsecretarias (nombre) values ('Operaciones'), ('Academica');

insert into tipos_espacio (nombre) values ('Salón'), ('Auditorio'), ('Vestíbulo'), ('Oficina');
insert into estados_espacio (nombre) values ('Disponible'), ('Ocupado'), ('Mantenimiento');

insert into propiedades (id, nombre, direccion) values
  ('77777777-7777-4777-8777-000000000001', 'Sede Central', 'Av. Principal 100');

-- Backfill de los 4 espacios sembrados en 0005, con coordenadas de plano
-- para que el editor tenga datos renderizables desde el primer momento.
update espacios set
  propiedad_id = '77777777-7777-4777-8777-000000000001',
  piso = '1',
  tipo_id = (select id from tipos_espacio where nombre = 'Auditorio'),
  estado_id = (select id from estados_espacio where nombre = 'Disponible'),
  pos_x = 40, pos_y = 40, ancho = 260, alto = 160
where id = '33333333-3333-4333-8333-000000000001';

update espacios set
  propiedad_id = '77777777-7777-4777-8777-000000000001',
  piso = '2',
  tipo_id = (select id from tipos_espacio where nombre = 'Salón'),
  estado_id = (select id from estados_espacio where nombre = 'Disponible'),
  pos_x = 40, pos_y = 40, ancho = 160, alto = 120
where id = '33333333-3333-4333-8333-000000000002';

update espacios set
  propiedad_id = '77777777-7777-4777-8777-000000000001',
  piso = '2',
  tipo_id = (select id from tipos_espacio where nombre = 'Salón'),
  estado_id = (select id from estados_espacio where nombre = 'Disponible'),
  pos_x = 240, pos_y = 40, ancho = 160, alto = 120
where id = '33333333-3333-4333-8333-000000000003';

update espacios set
  propiedad_id = '77777777-7777-4777-8777-000000000001',
  piso = '1',
  tipo_id = (select id from tipos_espacio where nombre = 'Vestíbulo'),
  estado_id = (select id from estados_espacio where nombre = 'Disponible'),
  pos_x = 40, pos_y = 240, ancho = 360, alto = 100
where id = '33333333-3333-4333-8333-000000000004';

insert into tolerancias_puntualidad (subsecretaria, hora_programada, tolerancia_minutos) values
  ('Operaciones', '08:00', 10),
  ('Academica', '08:30', 15);

-- Evidencia en todos los estados, sobre tareas ya sembradas de la rama SGL.
-- Autores y revisores calzan con el responsable/supervisor real de cada
-- tarea (ver 0005_seed.sql): tarea 1 -> responsable 007 / supervisor 006;
-- tarea 2 -> responsable 006 / supervisor 005; tarea 3 -> responsable 005.
insert into evidencias (tarea_id, autor_cargo_id, reporte, estado, puntaje, motivo_rechazo, revisado_por_cargo_id, revisado_en, tamano_bytes)
values
  ('55555555-5555-4555-8555-000000000001', '22222222-2222-4222-8222-000000000007',
   'Salón rotulado y listo, adjunto fotos del montaje.', 'aprobada', 95,
   null, '22222222-2222-4222-8222-000000000006', now() - interval '2 days', 184320),
  ('55555555-5555-4555-8555-000000000002', '22222222-2222-4222-8222-000000000006',
   'Conteo de materiales completo.', 'rechazada', null,
   'La foto no muestra el conteo completo, vuelve a intentarlo.',
   '22222222-2222-4222-8222-000000000005', now() - interval '1 day', 92160),
  ('55555555-5555-4555-8555-000000000003', '22222222-2222-4222-8222-000000000005',
   'Equipo confirmado, lista adjunta.', 'pendiente', null, null, null, null, 153600);

-- Asistencia en todos los estados, para el voluntario y el coordinador.
insert into asistencia (cargo_id, tipo, fecha, hora, lugar, estado)
values
  ('22222222-2222-4222-8222-000000000007', 'entrada', current_date - 2, '08:05', 'Sede Central', 'aprobado'),
  ('22222222-2222-4222-8222-000000000007', 'salida', current_date - 2, '17:10', 'Sede Central', 'aprobado'),
  ('22222222-2222-4222-8222-000000000007', 'entrada', current_date - 1, '08:20', 'Sede Central', 'pendiente'),
  ('22222222-2222-4222-8222-000000000006', 'entrada', current_date - 3, '07:55', 'Sede Central', 'aprobado');

update asistencia set aprobado_por = '22222222-2222-4222-8222-000000000006', aprobado_en = now() - interval '2 days'
where cargo_id = '22222222-2222-4222-8222-000000000007' and estado = 'aprobado';

update asistencia set aprobado_por = '22222222-2222-4222-8222-000000000005', aprobado_en = now() - interval '3 days'
where cargo_id = '22222222-2222-4222-8222-000000000006' and estado = 'aprobado';

-- Una fila anulada, con su rastro.
insert into asistencia (cargo_id, tipo, fecha, hora, lugar, estado, aprobado_por, aprobado_en)
values ('22222222-2222-4222-8222-000000000007', 'entrada', current_date - 5, '09:15', 'Sede Central', 'aprobado',
        '22222222-2222-4222-8222-000000000006', now() - interval '5 days');

-- El trigger de transición pisa anulado_por con cargo_actual(), que fuera
-- de una sesión autenticada es null; se desactiva solo para esta fila
-- sembrada, igual que 0005_seed.sql hace con trg_transicion_estado_tarea.
alter table asistencia disable trigger trg_transicion_asistencia;

update asistencia
   set estado = 'anulado', motivo_anulacion = 'Registrado por error, el voluntario no asistió ese día.',
       anulado_por = '22222222-2222-4222-8222-000000000006'
 where cargo_id = '22222222-2222-4222-8222-000000000007' and tipo = 'entrada' and fecha = current_date - 5;

alter table asistencia enable trigger trg_transicion_asistencia;

commit;
