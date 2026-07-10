create table if not exists public.app_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

drop policy if exists "App admins can view themselves" on public.app_admins;

create policy "App admins can view themselves"
on public.app_admins
for select
using (lower(email) = lower(auth.jwt() ->> 'email'));

create or replace function public.is_dinkdraw_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins
    where lower(app_admins.email) = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function public.admin_ensure_feature_entitlement(
  p_user_id uuid,
  p_organization_id uuid,
  p_feature_key text,
  p_notes text default 'Granted from admin page'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
begin
  if not public.is_dinkdraw_admin() then
    raise exception 'Not authorized';
  end if;

  select id
  into existing_id
  from public.feature_entitlements
  where feature_key = p_feature_key
    and (
      (p_user_id is null and user_id is null)
      or user_id = p_user_id
    )
    and (
      (p_organization_id is null and organization_id is null)
      or organization_id = p_organization_id
    )
  limit 1;

  if existing_id is not null then
    update public.feature_entitlements
    set
      status = 'active',
      notes = p_notes
    where id = existing_id;
  else
    insert into public.feature_entitlements (
      user_id,
      organization_id,
      feature_key,
      status,
      notes
    )
    values (
      p_user_id,
      p_organization_id,
      p_feature_key,
      'active',
      p_notes
    );
  end if;
end;
$$;

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
  if not public.is_dinkdraw_admin() then
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
  if not public.is_dinkdraw_admin() then
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

grant execute on function public.is_dinkdraw_admin() to authenticated;
grant execute on function public.admin_ensure_feature_entitlement(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_create_organization_with_access(uuid, text) to authenticated;
grant execute on function public.admin_rename_organization(uuid, text) to authenticated;

notify pgrst, 'reload schema';
