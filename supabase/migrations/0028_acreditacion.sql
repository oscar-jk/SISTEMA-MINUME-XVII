-- 0028 — Acreditación de delegados con QR (SIRIO-ACR). Los acreditados
-- NO son la misma población que personas/cargos: esa tabla modela la
-- jerarquía de ~163 miembros de staff con cuenta de acceso; un delegado
-- nacional, mesa directiva o invitado especial no tiene cargo, no inicia
-- sesión, y son hasta 700. Tabla propia, población propia.
--
-- Los datos de salud viven en una tabla aparte (acreditados_salud) con su
-- propia RLS, mucho más restrictiva que la del registro básico: son
-- diagnósticos médicos de menores de edad. El registro básico
-- (nombre/foto/estado del QR) sí lo necesita ver cualquier miembro de
-- staff en la puerta del evento — acceso amplio a propósito, distinto
-- del acceso a salud.
--
-- Sin política de insert/update en storage.objects ni en estas dos
-- tablas para `authenticated`/`anon`: el único camino de escritura es la
-- Edge Function pública `registrar-acreditado`, corriendo con
-- service_role (que bypasea RLS) — el mismo patrón que ya usan
-- crear-cuenta/alternar-cuenta/purgar-evidencia, aplicado por primera
-- vez a una ruta sin sesión.

create type rol_acreditacion as enum (
  'delegado_nacional', 'mesa_directiva', 'tecnico_docente', 'secretaria_general',
  'subsecretaria', 'staff', 'equipo_logistico', 'prensa_clit', 'invitado_especial'
);

create table acreditados (
  id                       uuid primary key default gen_random_uuid(),
  codigo_qr                text unique not null,
  rol                      rol_acreditacion not null,
  nombre                   text not null,
  apellido                 text not null,
  edad                     integer,
  telefono                 text,
  correo                   text,
  regional_id              uuid references regionales(id),
  centro_educativo         text,
  persona_id               uuid references personas(id),
  numero_habitacion        text,
  companero_habitacion     text,
  lider_edificio           text,
  foto_path                text,
  certificado_medico_path  text,
  estado                   text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo           text,
  revisado_por_cargo_id    uuid references cargos(id),
  revisado_en              timestamptz,
  creado_en                timestamptz not null default now()
);

alter table acreditados enable row level security;

-- Cualquier staff autenticado puede consultar (nombre/foto/estado) para
-- verificar una acreditación en la puerta — no solo quienes asignan.
create policy acreditados_select on acreditados
  for select to authenticated using (true);

create policy acreditados_update on acreditados
  for update to authenticated
  using (puede_asignar())
  with check (puede_asignar());

create policy acreditados_delete on acreditados
  for delete to authenticated using (es_super_admin());

create table acreditados_salud (
  acreditado_id         uuid primary key references acreditados(id) on delete cascade,
  diagnostico           text,
  alergias              text,
  tratamiento           text,
  contacto_emergencia   text,
  telefono_emergencia   text
);

alter table acreditados_salud enable row level security;

create policy acreditados_salud_select on acreditados_salud
  for select to authenticated
  using (
    es_super_admin()
    or exists (select 1 from cargos c where c.id = cargo_actual() and c.acceso_salud_acreditacion)
  );

create policy acreditados_salud_update on acreditados_salud
  for update to authenticated
  using (
    es_super_admin()
    or exists (select 1 from cargos c where c.id = cargo_actual() and c.acceso_salud_acreditacion)
  )
  with check (
    es_super_admin()
    or exists (select 1 from cargos c where c.id = cargo_actual() and c.acceso_salud_acreditacion)
  );

-- Registro de intentos de envío del formulario público, solo para el
-- límite de tasa por IP dentro de la Edge Function — nunca se lee ni se
-- escribe desde el cliente (sin políticas: RLS activa, cero acceso).
create table acreditacion_intentos (
  id          bigint generated always as identity primary key,
  ip_hash     text not null,
  creado_en   timestamptz not null default now()
);
alter table acreditacion_intentos enable row level security;

-- Storage: bucket privado, ruta {acreditado_id}/foto.jpg y
-- {acreditado_id}/certificado.pdf. La foto la puede ver cualquier staff
-- (verificación visual en la puerta); el certificado médico solo quien
-- tiene acceso_salud_acreditacion, porque es en sí mismo un documento de
-- salud.
insert into storage.buckets (id, name, public)
values ('acreditacion', 'acreditacion', false)
on conflict (id) do nothing;

create policy acreditacion_storage_select_foto on storage.objects
  for select to authenticated
  using (bucket_id = 'acreditacion' and name like '%/foto.%');

create policy acreditacion_storage_select_certificado on storage.objects
  for select to authenticated
  using (
    bucket_id = 'acreditacion' and name like '%/certificado.%'
    and (
      es_super_admin()
      or exists (select 1 from cargos c where c.id = cargo_actual() and c.acceso_salud_acreditacion)
    )
  );
