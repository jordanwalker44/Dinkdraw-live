create or replace function public.admin_set_feature_entitlement_status(
  p_user_id uuid,
  p_organization_id uuid,
  p_feature_key text,
  p_status text,
  p_notes text default 'Updated from admin page'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dinkdraw_admin() then
    raise exception 'Not authorized';
  end if;

  if (p_user_id is null) = (p_organization_id is null) then
    raise exception 'Provide exactly one user or organization';
  end if;

  if nullif(trim(p_feature_key), '') is null then
    raise exception 'Feature key is required';
  end if;

  if p_status not in ('active', 'inactive') then
    raise exception 'Status must be active or inactive';
  end if;

  update public.feature_entitlements
  set
    status = p_status,
    notes = p_notes
  where feature_key = p_feature_key
    and user_id is not distinct from p_user_id
    and organization_id is not distinct from p_organization_id;

  if not found and p_status = 'active' then
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
      p_status,
      p_notes
    );
  end if;
end;
$$;

revoke all on function public.admin_set_feature_entitlement_status(uuid, uuid, text, text, text) from public;
grant execute on function public.admin_set_feature_entitlement_status(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.admin_set_feature_entitlement_status(uuid, uuid, text, text, text) to service_role;
