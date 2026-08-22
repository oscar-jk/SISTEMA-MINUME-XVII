-- MINUME XVII — 0001 Esquema completo del sistema
-- Se crea todo el esquema, incluidas las tablas de módulos posteriores.
-- Solo las tablas del Módulo 1 tienen pantallas en esta entrega.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tipos

create type division as enum ('sg', 'sga', 'sgl');

create type tipo_cargo as enum (
  'super_admin', 'sg', 'sga', 'sgl',
  'subsecretario', 'coordinador', 'voluntario'
);

create type prioridad as enum ('baja', 'media', 'alta', 'critica');

create type estado_tarea as enum (
  'no_iniciada', 'en_curso', 'en_revision',
  'completada', 'cancelada', 'no_aplica'
);

create type estado_actividad as enum (
  'planificada', 'confirmada', 'en_curso', 'realizada', 'cancelada'
);

create type nivel_riesgo as enum ('bajo', 'medio', 'alto');

-- ------------------------------------------------------------ personas

create table personas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  apellido    text not null,
  correo      text unique,
  telefono    text,
  activa      boolean not null default true,
  creada_en   timestamptz not null default now()
);

-- Jerarquía. persona_id es nullable: un cargo puede estar vacante.
create table cargos (
  id             uuid primary key default gen_random_uuid(),
  persona_id     uuid references personas(id) on delete set null,
  nombre         text not null,
  division       division,
  subsecretaria  text,
  comision       text,
  superior_id    uuid references cargos(id) on delete set null,
  evaluador_id   uuid references cargos(id) on delete set null,
  tipo           tipo_cargo not null,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);

-- Enlaza la cuenta de auth con la persona. Sin autoservicio de registro:
-- las filas las crea el panel de administración.
create table usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  persona_id      uuid not null unique references personas(id) on delete cascade,
  es_super_admin  boolean not null default false,
  creado_en       timestamptz not null default now()
);

-- ------------------------------------------------------------- espacios

create table espacios (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  ubicacion text,
  capacidad integer,
  activo    boolean not null default true
);

create table actividades_estrategicas (
  id          uuid primary key default gen_random_uuid(),
  codigo      text unique not null,
  nombre      text not null,
  descripcion text
);

-- ---------------------------------------------------------- actividades

create table actividades (
  id                        uuid primary key default gen_random_uuid(),
  codigo                    text unique not null,
  nombre                    text not null,
  descripcion               text,
  actividad_estrategica_id  uuid references actividades_estrategicas(id) on delete set null,
  fecha                     date not null,
  hora_inicio               time,
  hora_fin                  time,
  fase                      text,
  area_responsable          text,
  dotacion_requerida        integer not null default 0 check (dotacion_requerida >= 0),
  prioridad                 prioridad not null default 'media',
  estado                    estado_actividad not null default 'planificada',
  riesgo                    nivel_riesgo not null default 'bajo',
  plan_b                    text,
  espacio_id                uuid references espacios(id) on delete set null,
  creada_por                uuid references cargos(id) on delete set null,
  creada_en                 timestamptz not null default now()
);

-- --------------------------------------------------------------- tareas

-- supervisor_cargo_id es NOT NULL: cada tarea tiene exactamente un supervisor.
-- responsable_cargo_id es nullable solo mientras la tarea recién desplegada
-- espera asignación; el flujo del panel obliga a asignarlo antes de confirmar.
create table tareas (
  id                    uuid primary key default gen_random_uuid(),
  actividad_id          uuid references actividades(id) on delete set null,
  titulo                text not null,
  descripcion           text,
  responsable_cargo_id  uuid references cargos(id) on delete set null,
  supervisor_cargo_id   uuid not null references cargos(id) on delete restrict,
  prioridad             prioridad not null default 'media',
  fecha_limite          date,
  estado                estado_tarea not null default 'no_iniciada',
  progreso              integer not null default 0 check (progreso between 0 and 100),
  requiere_evidencia    boolean not null default false,
  motivo_devolucion     text,
  creada_por            uuid references cargos(id) on delete set null,
  creada_en             timestamptz not null default now(),
  actualizada_en        timestamptz not null default now()
);

-- Registro inmutable. No se edita ni se borra: la historia de la tarea
-- es la secuencia de sus avances. Ver 0003_rls.sql y 0004_reglas_negocio.sql.
create table avances_tarea (
  id                  uuid primary key default gen_random_uuid(),
  tarea_id            uuid not null references tareas(id) on delete cascade,
  autor_cargo_id      uuid not null references cargos(id) on delete restrict,
  nota                text,
  progreso_reportado  integer not null check (progreso_reportado between 0 and 100),
  adjunto             text,
  fecha               timestamptz not null default now()
);

-- ------------------------------------- esquema reservado (sin pantallas)
-- Estas tablas existen desde ya para que los módulos de evaluación,
-- acreditación e incidencias no exijan migrar datos más adelante.

create table criterios_evaluacion (
  id          uuid primary key default gen_random_uuid(),
  codigo      text unique not null,
  nombre      text not null,
  descripcion text,
  peso        numeric(5,2) not null default 1,
  activo      boolean not null default true
);

create table cortes_evaluacion (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  fecha_inicio date not null,
  fecha_fin    date not null,
  cerrado      boolean not null default false
);

create table evaluaciones (
  id             uuid primary key default gen_random_uuid(),
  corte_id       uuid references cortes_evaluacion(id) on delete cascade,
  cargo_id       uuid references cargos(id) on delete cascade,
  evaluador_id   uuid references cargos(id) on delete set null,
  criterio_id    uuid references criterios_evaluacion(id) on delete set null,
  puntuacion     numeric(5,2),
  comentario     text,
  creada_en      timestamptz not null default now()
);

create table acreditaciones (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid references personas(id) on delete cascade,
  tipo        text,
  codigo      text unique,
  emitida_en  timestamptz,
  valida      boolean not null default true
);

create table incidencias (
  id             uuid primary key default gen_random_uuid(),
  actividad_id   uuid references actividades(id) on delete set null,
  reportada_por  uuid references cargos(id) on delete set null,
  descripcion    text not null,
  gravedad       nivel_riesgo not null default 'bajo',
  resuelta       boolean not null default false,
  creada_en      timestamptz not null default now()
);

-- -------------------------------------------------------------- índices

create index idx_cargos_superior      on cargos(superior_id);
create index idx_cargos_persona       on cargos(persona_id);
create index idx_actividades_fecha    on actividades(fecha);
create index idx_tareas_responsable   on tareas(responsable_cargo_id, estado);
create index idx_tareas_supervisor    on tareas(supervisor_cargo_id, estado);
create index idx_tareas_fecha_limite  on tareas(fecha_limite);
create index idx_tareas_actividad     on tareas(actividad_id);
create index idx_avances_tarea        on avances_tarea(tarea_id, fecha desc);
