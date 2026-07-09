create or replace function public.get_public_organization_brand(p_organization_id uuid)
returns table (
  id uuid,
  name text,
  logo_url text,
  primary_color text,
  accent_color text
)
language sql
security definer
set search_path = public
as $$
  select
    organizations.id,
    organizations.name,
    organizations.logo_url,
    organizations.primary_color,
    organizations.accent_color
  from public.organizations
  where organizations.id = p_organization_id
  limit 1;
$$;

grant execute on function public.get_public_organization_brand(uuid) to anon;
grant execute on function public.get_public_organization_brand(uuid) to authenticated;
