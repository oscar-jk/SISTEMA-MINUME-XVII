-- MINUME XVII — 0003 RLS
-- Toda regla de acceso vive aquí. El frontend solo oculta botones.
-- No hay ninguna política permisiva por defecto: lo que no está escrito, no se puede.

alter table personas                 enable row level security;
alter table cargos                   enable row level security;
alter table usuarios                 enable row level security;
alter table espacios                 enable row level security;
alter table actividades_estrategicas enable row level security;
alter table actividades              enable row level security;
alter table tareas                   enable row level security;
alter table avances_tarea            enable row level security;
alter table criterios_evaluacion     enable row level security;
alter table cortes_evaluacion        enable row level security;
alter table evaluaciones             enable row level security;
alter table acreditaciones           enable row level security;
alter table incidencias              enable row level security;

-- ------------------------------------------------------------ usuarios

create policy usuarios_select_propio on usuarios
  for select to authenticated
  using (id = auth.uid() or es_super_admin());

create policy usuarios_admin_todo on usuarios
  for all to authenticated
  using (es_super_admin()) with check (es_super_admin());

-- --------------------------------------------------------------- cargos

-- Cada quien ve su rama hacia abajo. Además su propio superior, para poder
-- mostrar quién lo supervisa sin abrir la rama ajena.
create policy cargos_select_rama on cargos
  for select to authenticated
  using (
    es_super_admin()
    or es_descendiente(id)
    or id = superior_actual()
  );

create policy cargos_admin_todo on cargos
  for all to authenticated
  using (es_super_admin()) with check (es_super_admin());

-- ------------------------------------------------------------- personas

create policy personas_select_rama on personas
  for select to authenticated
  using (persona_visible(id));

create policy personas_admin_todo on personas
  for all to authenticated
  using (es_super_admin()) with check (es_super_admin());

-- ---------------------------------------------- catálogos y actividades

create policy espacios_select on espacios
  for select to authenticated using (true);
create policy espacios_escritura on espacios
  for all to authenticated using (puede_asignar()) with check (puede_asignar());

create policy act_estrat_select on actividades_estrategicas
  for select to authenticated using (true);
create policy act_estrat_escritura on actividades_estrategicas
  for all to authenticated using (puede_asignar()) with check (puede_asignar());

-- El calendario del evento es común a todo el equipo organizador.
create policy actividades_select on actividades
  for select to authenticated using (true);

create policy actividades_insert on actividades
  for insert to authenticated with check (puede_asignar());

create policy actividades_update on actividades
  for update to authenticated using (puede_asignar()) with check (puede_asignar());

create policy actividades_delete on actividades
  for delete to authenticated using (es_super_admin());

-- --------------------------------------------------------------- tareas

-- Un usuario ve su propia rama hacia abajo, más sus propios registros.
-- Un voluntario no puede leer tareas de otra rama ni atacando la API directa.
create policy tareas_select_rama on tareas
  for select to authenticated
  using (
    es_super_admin()
    or es_descendiente(responsable_cargo_id)
    or es_descendiente(supervisor_cargo_id)
  );

-- Crear y asignar: super admin, SG, SGA, SGL, subsecretarios y coordinadores,
-- siempre dentro de su ámbito.
create policy tareas_insert on tareas
  for insert to authenticated
  with check (
    puede_asignar()
    and (
      es_super_admin()
      or (
        (responsable_cargo_id is null or es_descendiente(responsable_cargo_id))
        and es_descendiente(supervisor_cargo_id)
      )
    )
  );

-- El responsable puede avanzar la suya; la cadena de supervisión también.
-- Qué transiciones son legales lo decide el trigger de 0004.
create policy tareas_update on tareas
  for update to authenticated
  using (
    es_super_admin()
    or responsable_cargo_id = cargo_actual()
    or supervisor_cargo_id = cargo_actual()
    or es_ascendiente_de(supervisor_cargo_id)
    or es_descendiente(responsable_cargo_id)
  )
  with check (
    es_super_admin()
    or responsable_cargo_id = cargo_actual()
    or supervisor_cargo_id = cargo_actual()
    or es_ascendiente_de(supervisor_cargo_id)
    or es_descendiente(responsable_cargo_id)
  );

create policy tareas_delete on tareas
  for delete to authenticated using (es_super_admin());

-- -------------------------------------------------------- avances_tarea

create policy avances_select on avances_tarea
  for select to authenticated using (puede_ver_tarea(tarea_id));

-- Registrar avances: el responsable de la tarea y su cadena de supervisión.
-- El autor es siempre el cargo del propio usuario: no se puede firmar por otro.
create policy avances_insert on avances_tarea
  for insert to authenticated
  with check (
    autor_cargo_id = cargo_actual()
    and exists (
      select 1 from tareas t
      where t.id = tarea_id
        and (
          t.responsable_cargo_id = cargo_actual()
          or t.supervisor_cargo_id = cargo_actual()
          or es_ascendiente_de(t.supervisor_cargo_id)
        )
    )
  );

-- Sin política de UPDATE ni de DELETE, a propósito.
-- La inmutabilidad del historial es estructural, no una convención:
-- ni el super admin puede editar o borrar un avance.

-- ---------------------------------------- esquema reservado: solo admin
-- Los módulos posteriores traerán sus propias políticas. Mientras tanto
-- estas tablas quedan cerradas a todo el mundo salvo el super admin.

create policy criterios_admin on criterios_evaluacion
  for all to authenticated using (es_super_admin()) with check (es_super_admin());
create policy cortes_admin on cortes_evaluacion
  for all to authenticated using (es_super_admin()) with check (es_super_admin());
create policy evaluaciones_admin on evaluaciones
  for all to authenticated using (es_super_admin()) with check (es_super_admin());
create policy acreditaciones_admin on acreditaciones
  for all to authenticated using (es_super_admin()) with check (es_super_admin());
create policy incidencias_admin on incidencias
  for all to authenticated using (es_super_admin()) with check (es_super_admin());
