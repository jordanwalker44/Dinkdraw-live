alter table public.organizations
  add column if not exists logo_url text,
  add column if not exists primary_color text default '#00274C',
  add column if not exists accent_color text default '#FFCB05';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_primary_color_hex'
  ) then
    alter table public.organizations
      add constraint organizations_primary_color_hex
      check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$')
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_accent_color_hex'
  ) then
    alter table public.organizations
      add constraint organizations_accent_color_hex
      check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$')
      not valid;
  end if;
end $$;

drop policy if exists "Organization owners can update branding" on public.organizations;

create policy "Organization owners can update branding"
on public.organizations
for update
using (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = organizations.id
      and organization_members.user_id = auth.uid()
      and organization_members.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = organizations.id
      and organization_members.user_id = auth.uid()
      and organization_members.role in ('owner', 'admin')
  )
);
