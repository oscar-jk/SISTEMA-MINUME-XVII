-- 0023 — Resuelve B7: cargo_actual() y sesion.js asumían un solo cargo por
-- persona (order by creado_en limit 1). Con 15 comisiones de 5 roles cada
-- una, una persona puede legítimamente ocupar dos cargos a la vez (ej. dos
-- roles de mesa directiva en comisiones distintas) — el segundo cargo
-- simplemente no existía para el sistema. Se adopta "cargo activo
-- seleccionable" (decisión del usuario, no unión de permisos): la sesión
-- guarda cuál cargo está en uso; cargo_actual() lo respeta si hay uno
-- guardado y sigue siendo válido, y si no, cae al comportamiento de
-- siempre (el cargo más antiguo) — cero cambio para quien solo tiene un
-- cargo, que es la inmensa mayoría. Sin costo de rendimiento en RLS: sigue
-- siendo una fila, no una unión de CTEs recursivas por cargo.

create table cargo_activo (
  usuario_id     uuid primary key references usuarios(id) on delete cascade,
  cargo_id       uuid not null references cargos(id),
  actualizado_en timestamptz not null default now()
);

alter table cargo_activo enable row level security;

create policy cargo_activo_propio on cargo_activo
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create or replace function fn_establecer_cargo_activo(p_cargo uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from cargos c
    join usuarios u on u.persona_id = c.persona_id
    where u.id = auth.uid() and c.id = p_cargo and c.activo
  ) then
    raise exception 'Ese cargo no pertenece a tu persona o no está activo.' using errcode = '42501';
  end if;

  insert into cargo_activo (usuario_id, cargo_id, actualizado_en)
  values (auth.uid(), p_cargo, now())
  on conflict (usuario_id) do update set cargo_id = excluded.cargo_id, actualizado_en = now();
end;
$$;

revoke execute on function fn_establecer_cargo_activo(uuid) from public, anon;
grant execute on function fn_establecer_cargo_activo(uuid) to authenticated;

create or replace function cargo_actual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select ca.cargo_id
      from cargo_activo ca
      join cargos c on c.id = ca.cargo_id
      where ca.usuario_id = auth.uid() and c.activo
    ),
    (
      select c.id
      from usuarios u
      join cargos c on c.persona_id = u.persona_id and c.activo
      where u.id = auth.uid()
      order by c.creado_en
      limit 1
    )
  );
$$;
