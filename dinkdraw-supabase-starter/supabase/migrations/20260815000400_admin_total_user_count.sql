-- Total registered authentication accounts for the private admin monitor.
create or replace function public.admin_get_total_user_count()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dinkdraw_admin() then
    raise exception 'Not authorized';
  end if;

  return (select count(*)::bigint from auth.users);
end;
$$;

revoke all on function public.admin_get_total_user_count() from public;
revoke all on function public.admin_get_total_user_count() from anon;
grant execute on function public.admin_get_total_user_count() to authenticated;
grant execute on function public.admin_get_total_user_count() to service_role;

notify pgrst, 'reload schema';
