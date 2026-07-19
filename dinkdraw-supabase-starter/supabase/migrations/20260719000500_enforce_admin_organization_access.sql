-- Restrict organization creation and membership management to the single
-- account present in both DinkDraw admin registries.
--
-- Existing members retain read access. Existing organization owners/admins
-- retain branding management. Tournament permissions are not changed.

create or replace function public.can_manage_organizations()
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_dinkdraw_admin()
    and exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    );
$$;

revoke all on function public.can_manage_organizations() from public;
revoke all on function public.can_manage_organizations() from anon;
grant execute on function public.can_manage_organizations() to authenticated;
grant execute on function public.can_manage_organizations() to service_role;

create or replace function public.admin_create_organization_with_access(
  p_user_id uuid,
  p_organization_name text
)
returns table (
  id uuid,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_organization public.organizations%rowtype;
begin
  if not public.can_manage_organizations() then
    raise exception 'Not authorized';
  end if;

  if p_user_id is null or nullif(trim(p_organization_name), '') is null then
    raise exception 'User and organization name are required';
  end if;

  insert into public.organizations (
    name,
    created_by_user_id
  )
  values (
    trim(p_organization_name),
    p_user_id
  )
  returning * into created_organization;

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  )
  values (
    created_organization.id,
    p_user_id,
    'owner'
  );

  perform public.admin_ensure_feature_entitlement(
    p_user_id,
    null,
    'organization_mode',
    'Granted from admin page for ' || created_organization.name
  );

  perform public.admin_ensure_feature_entitlement(
    p_user_id,
    null,
    'cream_of_the_crop',
    'Granted from admin page for ' || created_organization.name
  );

  perform public.admin_ensure_feature_entitlement(
    null,
    created_organization.id,
    'cream_of_the_crop',
    'Granted from admin page'
  );

  return query
  select created_organization.id, created_organization.name;
end;
$$;

create or replace function public.admin_rename_organization(
  p_organization_id uuid,
  p_organization_name text
)
returns table (
  id uuid,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_organizations() then
    raise exception 'Not authorized';
  end if;

  if p_organization_id is null or nullif(trim(p_organization_name), '') is null then
    raise exception 'Organization and new name are required';
  end if;

  return query
  update public.organizations
  set name = trim(p_organization_name)
  where organizations.id = p_organization_id
  returning organizations.id, organizations.name;
end;
$$;

drop policy if exists "Authenticated users can insert organizations" on public.organizations;
drop policy if exists "Users can create their own owner membership" on public.organization_members;
drop policy if exists "Organization creators can add members" on public.organization_members;
drop policy if exists "Organization creators can delete members" on public.organization_members;
drop policy if exists "Organization creators can update members" on public.organization_members;
drop policy if exists "Admins can manage organizations" on public.organizations;
drop policy if exists "Admins can manage organization members" on public.organization_members;

drop policy if exists "DinkDraw admin can manage organizations" on public.organizations;
create policy "DinkDraw admin can manage organizations"
on public.organizations
for all
to authenticated
using (public.can_manage_organizations())
with check (public.can_manage_organizations());

drop policy if exists "DinkDraw admin can manage organization members" on public.organization_members;
create policy "DinkDraw admin can manage organization members"
on public.organization_members
for all
to authenticated
using (public.can_manage_organizations())
with check (public.can_manage_organizations());

notify pgrst, 'reload schema';
