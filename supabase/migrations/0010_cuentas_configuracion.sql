-- 0010 — Cuentas (activa/desactivada), configuración del sistema y
-- catálogo de subsecretarías.

alter table usuarios add column activa boolean not null default true, add column desactivada_en timestamptz;

create table configuracion_sistema (
  clave         text primary key,
  valor         jsonb not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references cargos(id)
);

alter table configuracion_sistema enable row level security;

create policy configuracion_select on configuracion_sistema
  for select to authenticated using (true);
create policy configuracion_escritura on configuracion_sistema
  for all to authenticated using (es_super_admin()) with check (es_super_admin());

insert into configuracion_sistema (clave, valor) values
  ('fecha_evento_inicio', '"2026-11-03"'),
  ('fecha_evento_fin', '"2026-11-10"'),
  ('evidencia_ventana_purga_dias', '90'),
  ('evidencia_tope_kb', '800');

create table subsecretarias (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activa boolean not null default true
);

alter table subsecretarias enable row level security;

create policy subsecretarias_select on subsecretarias
  for select to authenticated using (true);
create policy subsecretarias_escritura on subsecretarias
  for all to authenticated using (puede_asignar()) with check (puede_asignar());
