-- MINUME XVII — 0005 Datos de prueba
-- Un usuario por tipo de cargo, con jerarquía coherente, y suficientes
-- actividades y tareas para ver el calendario poblado.
-- Las cuentas de auth se crean aparte (ver supabase/crear_usuarios.md);
-- al final de este archivo se enlazan por correo si ya existen.

begin;

-- ------------------------------------------------- personas y jerarquía

insert into personas (id, nombre, apellido, correo, telefono) values
  ('11111111-1111-4111-8111-000000000001','Oscar','Nunez','oscarnunez.contacto@gmail.com','809-000-0001'),
  ('11111111-1111-4111-8111-000000000002','Lucia','Fermin','sg@minume.test','809-000-0002'),
  ('11111111-1111-4111-8111-000000000003','Rafael','Peralta','sga@minume.test','809-000-0003'),
  ('11111111-1111-4111-8111-000000000004','Camila','Objio','sgl@minume.test','809-000-0004'),
  ('11111111-1111-4111-8111-000000000005','Diego','Santana','subsecretario@minume.test','809-000-0005'),
  ('11111111-1111-4111-8111-000000000006','Paola','Guzman','coordinador@minume.test','809-000-0006'),
  ('11111111-1111-4111-8111-000000000007','Andres','Mejia','voluntario@minume.test','809-000-0007');

-- super_admin -> sg -> {sga, sgl} -> subsecretario -> coordinador -> voluntario
insert into cargos (id, persona_id, nombre, division, subsecretaria, comision, superior_id, tipo) values
  ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-000000000001','Administracion del sistema',null,null,null,null,'super_admin'),
  ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000002','Secretaria General','sg',null,null,'22222222-2222-4222-8222-000000000001','sg'),
  ('22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-000000000003','Secretaria General Adjunta','sga',null,null,'22222222-2222-4222-8222-000000000002','sga'),
  ('22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-000000000004','Secretaria General Logistica','sgl',null,null,'22222222-2222-4222-8222-000000000002','sgl'),
  ('22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-000000000005','Subsecretaria de Operaciones','sgl','Operaciones',null,'22222222-2222-4222-8222-000000000004','subsecretario'),
  ('22222222-2222-4222-8222-000000000006','11111111-1111-4111-8111-000000000006','Coordinacion de Salon','sgl','Operaciones','Salones','22222222-2222-4222-8222-000000000005','coordinador'),
  ('22222222-2222-4222-8222-000000000007','11111111-1111-4111-8111-000000000007','Voluntariado de Salon','sgl','Operaciones','Salones','22222222-2222-4222-8222-000000000006','voluntario');

update cargos set evaluador_id = superior_id where superior_id is not null;

-- Una rama paralela, para comprobar el aislamiento: el voluntario de la
-- rama SGL no debe poder leer nada de esta.
insert into personas (id, nombre, apellido, correo) values
  ('11111111-1111-4111-8111-000000000008','Marisol','Batista','academica@minume.test'),
  ('11111111-1111-4111-8111-000000000009','Kevin','Rosario','voluntario2@minume.test');

insert into cargos (id, persona_id, nombre, division, subsecretaria, superior_id, tipo) values
  ('22222222-2222-4222-8222-000000000008','11111111-1111-4111-8111-000000000008','Subsecretaria Academica','sga','Academica','22222222-2222-4222-8222-000000000003','subsecretario'),
  ('22222222-2222-4222-8222-000000000009','11111111-1111-4111-8111-000000000009','Voluntariado Academico','sga','Academica','22222222-2222-4222-8222-000000000008','voluntario');

-- ------------------------------------------------ espacios y estrategicas

insert into espacios (id, nombre, ubicacion, capacidad) values
  ('33333333-3333-4333-8333-000000000001','Salon Plenario','Nivel 1', 400),
  ('33333333-3333-4333-8333-000000000002','Salon Comision A','Nivel 2', 60),
  ('33333333-3333-4333-8333-000000000003','Salon Comision B','Nivel 2', 60),
  ('33333333-3333-4333-8333-000000000004','Vestibulo','Planta baja', 200);

insert into actividades_estrategicas (id, codigo, nombre) values
  ('44444444-4444-4444-8444-000000000001','AE-01','Formacion del equipo organizador'),
  ('44444444-4444-4444-8444-000000000002','AE-02','Ejecucion del evento'),
  ('44444444-4444-4444-8444-000000000003','AE-03','Logistica y espacios');

-- ---------------------------------------------------------- actividades

-- El evento es del 3 al 10 de noviembre de 2026, tentativo. Alrededor de esa
-- semana se reparten preparacion, ejecucion y cierre.
insert into actividades
  (codigo, nombre, descripcion, actividad_estrategica_id, fecha, hora_inicio, hora_fin,
   fase, area_responsable, dotacion_requerida, prioridad, estado, riesgo, plan_b, espacio_id, creada_por)
select
  'ACT-' || lpad(g::text, 3, '0'),
  (array['Capacitacion de voluntarios','Montaje de salones','Ensayo de apertura',
         'Acreditacion de delegaciones','Sesion de comision','Sesion plenaria',
         'Almuerzo institucional','Desmontaje y cierre'])[1 + (g % 8)] ||
    ' - jornada ' || g,
  'Actividad generada para poblar el calendario del Modulo 1.',
  (array['44444444-4444-4444-8444-000000000001',
         '44444444-4444-4444-8444-000000000002',
         '44444444-4444-4444-8444-000000000003'])[1 + (g % 3)]::uuid,
  date '2026-10-20' + (g * 2),
  (array['08:00','10:30','14:00'])[1 + (g % 3)]::time,
  (array['10:00','12:30','17:00'])[1 + (g % 3)]::time,
  (array['preparacion','ejecucion','cierre'])[1 + (g % 3)],
  (array['Operaciones','Academica','Logistica','Protocolo'])[1 + (g % 4)],
  (array[3,5,8,6,4])[1 + (g % 5)],
  (array['baja','media','alta','critica'])[1 + (g % 4)]::prioridad,
  (array['planificada','confirmada','en_curso','realizada'])[1 + (g % 4)]::estado_actividad,
  (array['bajo','medio','alto'])[1 + (g % 3)]::nivel_riesgo,
  case when g % 3 = 0 then 'Reubicar en el vestibulo y reducir aforo.' else null end,
  (array['33333333-3333-4333-8333-000000000001',
         '33333333-3333-4333-8333-000000000002',
         '33333333-3333-4333-8333-000000000003',
         '33333333-3333-4333-8333-000000000004'])[1 + (g % 4)]::uuid,
  '22222222-2222-4222-8222-000000000002'
from generate_series(1, 25) g;

-- Una actividad con dotacion 8 exacta, para el criterio de aceptacion.
update actividades set dotacion_requerida = 8 where codigo = 'ACT-006';

-- --------------------------------------------------------------- tareas

-- Tareas de la rama SGL (responsable: voluntario, coordinador, subsecretario)
-- en todos los estados, con varias vencidas.
insert into tareas
  (id, actividad_id, titulo, descripcion, responsable_cargo_id, supervisor_cargo_id,
   prioridad, fecha_limite, estado, progreso, requiere_evidencia, creada_por)
select
  ('55555555-5555-4555-8555-' || lpad(g::text, 12, '0'))::uuid,
  a.id,
  (array['Verificar rotulacion del salon','Recibir y contar materiales',
         'Confirmar asistencia del equipo','Revisar audio y microfonos',
         'Preparar carpetas de delegado','Coordinar relevo de turno'])[1 + (g % 6)]
    || ' (' || a.codigo || ')',
  'Tarea de prueba con historial y estados variados.',
  (array['22222222-2222-4222-8222-000000000007',
         '22222222-2222-4222-8222-000000000007',
         '22222222-2222-4222-8222-000000000006',
         '22222222-2222-4222-8222-000000000005'])[1 + (g % 4)]::uuid,
  (array['22222222-2222-4222-8222-000000000006',
         '22222222-2222-4222-8222-000000000006',
         '22222222-2222-4222-8222-000000000005',
         '22222222-2222-4222-8222-000000000004'])[1 + (g % 4)]::uuid,
  (array['baja','media','alta','critica'])[1 + (g % 4)]::prioridad,
  case when g % 7 = 0 then current_date - (g % 5) - 1 else a.fecha end,
  (array['no_iniciada','en_curso','en_revision','completada','cancelada','no_aplica'])[1 + (g % 6)]::estado_tarea,
  (array[0, 35, 90, 100, 20, 0])[1 + (g % 6)],
  (g % 3 = 0),
  '22222222-2222-4222-8222-000000000005'
from generate_series(1, 48) g
join lateral (
  select id, codigo, fecha from actividades
  order by codigo offset (g % 25) limit 1
) a on true;

-- Tareas de la rama SGA (academica), que la rama SGL no debe poder leer.
insert into tareas
  (id, actividad_id, titulo, responsable_cargo_id, supervisor_cargo_id,
   prioridad, fecha_limite, estado, progreso, creada_por)
select
  ('66666666-6666-4666-8666-' || lpad(g::text, 12, '0'))::uuid,
  a.id,
  'Revision de documento de posicion ' || g,
  '22222222-2222-4222-8222-000000000009',
  '22222222-2222-4222-8222-000000000008',
  'media'::prioridad,
  a.fecha,
  (array['no_iniciada','en_curso','en_revision','completada'])[1 + (g % 4)]::estado_tarea,
  (array[0, 40, 85, 100])[1 + (g % 4)],
  '22222222-2222-4222-8222-000000000003'
from generate_series(1, 12) g
join lateral (
  select id, fecha from actividades order by codigo offset (g % 25) limit 1
) a on true;

-- Una tarea sin actividad de origen, para comprobar el FK nullable.
insert into tareas (titulo, descripcion, responsable_cargo_id, supervisor_cargo_id,
                    prioridad, fecha_limite, estado, creada_por)
values ('Levantar inventario de radios', 'No nace de ninguna actividad del calendario.',
        '22222222-2222-4222-8222-000000000007','22222222-2222-4222-8222-000000000006',
        'alta', current_date + 3, 'en_curso', '22222222-2222-4222-8222-000000000006');

-- --------------------------------------------------------------- avances

-- Historial encadenado: tres avances por tarea en las primeras 12 tareas
-- de la rama SGL, para poder leer la secuencia completa. El trigger de
-- progreso corre en cada insercion (AFTER INSERT) y deja el progreso de la
-- tarea igual al del ultimo avance: es justamente lo que queremos.
insert into avances_tarea (tarea_id, autor_cargo_id, nota, progreso_reportado, fecha)
select
  t.id,
  t.responsable_cargo_id,
  (array['Arranco con la revision del area asignada.',
         'Ya esta la mitad; falta confirmar el conteo final.',
         'Listo de mi parte, queda pendiente el visto bueno.'])[n],
  (array[20, 55, 95])[n],
  now() - ((4 - n) || ' days')::interval
from tareas t
cross join generate_series(1, 3) n
where t.id::text like '55555555-5555-4555-8555-%'
  and t.responsable_cargo_id is not null
  and substring(t.id::text from 25)::bigint <= 12
order by t.id, n;

-- Devolver el estado sembrado a lo que la semilla declara: el trigger de
-- avances movio estado y progreso de esas 12 tareas. Se desactiva el
-- trigger de transicion para poder fijar en_revision directamente.
alter table tareas disable trigger trg_transicion_estado_tarea;

update tareas t set progreso = 95, estado = 'en_revision'
where t.id::text like '55555555-5555-4555-8555-%'
  and substring(t.id::text from 25)::bigint <= 12
  and t.estado = 'en_curso';

alter table tareas enable trigger trg_transicion_estado_tarea;

-- ------------------------------------------- enlace con cuentas de auth

-- Idempotente: enlaza cada persona con su cuenta de auth si ya fue creada.
-- Volver a ejecutar esta sentencia despues de crear los usuarios basta.
insert into usuarios (id, persona_id, es_super_admin)
select u.id, p.id, (p.correo = 'oscarnunez.contacto@gmail.com')
from auth.users u
join personas p on lower(p.correo) = lower(u.email)
on conflict (id) do nothing;

commit;
