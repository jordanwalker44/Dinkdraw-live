-- Reliably initialize email/password accounts inside the auth transaction.
-- This supports both immediate-session signup and future email confirmation.

create or replace function public.initialize_new_dinkdraw_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_display_name text;
begin
  -- DinkDraw currently supports email-based accounts. Do not block a future
  -- non-email auth provider from creating its auth.users row.
  if new.email is null then
    return new;
  end if;

  requested_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Player'
  );

  insert into public.profiles (
    id,
    display_name,
    email
  )
  values (
    new.id,
    requested_display_name,
    new.email
  )
  on conflict (id) do nothing;

  insert into public.lifetime_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.initialize_new_dinkdraw_account() from public;
revoke all on function public.initialize_new_dinkdraw_account() from anon;
revoke all on function public.initialize_new_dinkdraw_account() from authenticated;

drop trigger if exists initialize_new_dinkdraw_account_after_signup on auth.users;

create trigger initialize_new_dinkdraw_account_after_signup
after insert on auth.users
for each row
execute function public.initialize_new_dinkdraw_account();

comment on function public.initialize_new_dinkdraw_account()
is 'Creates the profile and lifetime stats row for each new email-based DinkDraw account.';
