-- Authorize DinkDraw administrators by their stable Supabase user ID.
-- app_admins remains as legacy reference data but no longer grants authority.

create or replace function public.is_dinkdraw_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  );
$$;

revoke all on function public.is_dinkdraw_admin() from public;
revoke all on function public.is_dinkdraw_admin() from anon;
grant execute on function public.is_dinkdraw_admin() to authenticated;
grant execute on function public.is_dinkdraw_admin() to service_role;

revoke all on function public.admin_ensure_feature_entitlement(uuid, uuid, text, text) from public;
revoke all on function public.admin_ensure_feature_entitlement(uuid, uuid, text, text) from anon;
grant execute on function public.admin_ensure_feature_entitlement(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_ensure_feature_entitlement(uuid, uuid, text, text) to service_role;

revoke all on function public.admin_create_organization_with_access(uuid, text) from public;
revoke all on function public.admin_create_organization_with_access(uuid, text) from anon;
grant execute on function public.admin_create_organization_with_access(uuid, text) to authenticated;
grant execute on function public.admin_create_organization_with_access(uuid, text) to service_role;

revoke all on function public.admin_rename_organization(uuid, text) from public;
revoke all on function public.admin_rename_organization(uuid, text) from anon;
grant execute on function public.admin_rename_organization(uuid, text) to authenticated;
grant execute on function public.admin_rename_organization(uuid, text) to service_role;

revoke all on function public.admin_find_user_by_email(text) from public;
revoke all on function public.admin_find_user_by_email(text) from anon;
grant execute on function public.admin_find_user_by_email(text) to authenticated;
grant execute on function public.admin_find_user_by_email(text) to service_role;

revoke all on function public.admin_get_profiles_by_ids(uuid[]) from public;
revoke all on function public.admin_get_profiles_by_ids(uuid[]) from anon;
grant execute on function public.admin_get_profiles_by_ids(uuid[]) to authenticated;
grant execute on function public.admin_get_profiles_by_ids(uuid[]) to service_role;

notify pgrst, 'reload schema';
