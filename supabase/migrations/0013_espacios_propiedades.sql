-- 0013 — Propiedades, tipos y estados de espacio (catálogos, no enums —
-- ítem 166), coordenadas de plano y asignaciones de personal a espacio.

create table propiedades (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  direccion text,
  activo    boolean not null default true
);

create table tipos_espacio (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table estados_espacio (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

alter table propiedades enable row level security;
alter table tipos_espacio enable row level security;
alter table estados_espacio enable row level security;

create policy propiedades_select on propiedades for select to authenticated using (true);
create policy propiedades_escritura on propiedades for all to authenticated using (puede_asignar()) with check (puede_asignar());
create policy tipos_espacio_select on tipos_espacio for select to authenticated using (true);
create policy tipos_espacio_escritura on tipos_espacio for all to authenticated using (puede_asignar()) with check (puede_asignar());
create policy estados_espacio_select on estados_espacio for select to authenticated using (true);
create policy estados_espacio_escritura on estados_espacio for all to authenticated using (puede_asignar()) with check (puede_asignar());

alter table espacios
  add column propiedad_id uuid references propiedades(id),
  add column piso text,
  add column tipo_id uuid references tipos_espacio(id),
  add column estado_id uuid references estados_espacio(id),
  add column pos_x numeric,
  add column pos_y numeric,
  add column ancho numeric,
  add column alto numeric;

create table asignaciones_espacio (
  id          uuid primary key default gen_random_uuid(),
  espacio_id  uuid not null references espacios(id),
  cargo_id    uuid not null references cargos(id),
  fecha       date not null,
  hora_inicio time not null,
  hora_fin    time not null,
  creado_por  uuid references cargos(id),
  creada_en   timestamptz not null default now()
);

alter table asignaciones_espacio enable row level security;

create policy asignaciones_espacio_select on asignaciones_espacio
  for select to authenticated
  using (es_super_admin() or puede_asignar() or cargo_id = cargo_actual() or es_descendiente(cargo_id));

create policy asignaciones_espacio_escritura on asignaciones_espacio
  for all to authenticated
  using (puede_asignar() and es_descendiente(cargo_id))
  with check (puede_asignar() and es_descendiente(cargo_id));
