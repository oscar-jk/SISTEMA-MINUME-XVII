-- 0031 — Bloque 0: siembra las 15 comisiones de SGA y las 3 subsecretarías
-- que reportan directo a SG. SGL se deja vacío a propósito: el producto
-- aún no tiene los 5 nombres reales; el admin los añade luego desde
-- Admin → Catálogos → Subsecretarías.

begin;

insert into comisiones (codigo, nombre) values
  ('CTD', 'CTD'),
  ('PNUD', 'PNUD'),
  ('CSNU', 'CSNU'),
  ('ONUDC', 'ONUDC'),
  ('CIJ', 'CIJ'),
  ('ONUDI', 'ONUDI'),
  ('UNCTAD', 'UNCTAD'),
  ('OMT', 'OMT'),
  ('CIME', 'CIME'),
  ('COP31', 'COP31'),
  ('AMS', 'AMS'),
  ('FSCDH', 'FSCDH'),
  ('OMA', 'OMA'),
  ('CRPD', 'CRPD'),
  ('UNESCO_JD', 'UNESCO Juventud y Deporte');

insert into subsecretarias (nombre, division) values
  ('Planificación y Desarrollo', 'sg'),
  ('Comunicaciones y Relaciones Intercomisional', 'sg'),
  ('Tecnología de la Información', 'sg');

commit;
