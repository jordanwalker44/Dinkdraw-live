create table if not exists public.training_partner_invitations (
  id uuid primary key default gen_random_uuid(),
  source_session_id uuid not null references public.training_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  entry_snapshot jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  accepted_session_id uuid references public.training_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id),
  check (jsonb_typeof(entry_snapshot) = 'array')
);

create unique index if not exists training_partner_invitation_unique
  on public.training_partner_invitations(source_session_id, recipient_id);
create unique index if not exists training_partner_accepted_session_unique
  on public.training_partner_invitations(accepted_session_id)
  where accepted_session_id is not null;
create index if not exists training_partner_recipient_status_idx
  on public.training_partner_invitations(recipient_id, status, created_at desc);
create index if not exists training_partner_sender_status_idx
  on public.training_partner_invitations(sender_id, status, created_at desc);

alter table public.training_partner_invitations enable row level security;

drop policy if exists "Training partners can view their invitations" on public.training_partner_invitations;
drop policy if exists "Users can invite training partners" on public.training_partner_invitations;

create policy "Training partners can view their invitations"
  on public.training_partner_invitations
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "Users can invite training partners"
  on public.training_partner_invitations
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id <> auth.uid()
    and status = 'pending'
    and accepted_session_id is null
    and exists (
      select 1
      from public.training_sessions session
      where session.id = source_session_id
        and session.user_id = auth.uid()
        and session.source = 'manual'
    )
  );

create or replace function public.respond_to_training_partner_invitation(
  invitation_id uuid,
  response text,
  copied_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if response not in ('accepted', 'declined') then
    raise exception 'Invalid training invitation response';
  end if;

  if response = 'accepted' and not exists (
    select 1 from public.training_sessions
    where id = copied_session_id and user_id = auth.uid()
  ) then
    raise exception 'Accepted training session not found';
  end if;

  update public.training_partner_invitations
  set status = response,
      accepted_session_id = case when response = 'accepted' then copied_session_id else null end,
      responded_at = now()
  where id = invitation_id
    and recipient_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Training invitation is no longer available';
  end if;
end;
$$;

create or replace function public.cancel_training_partner_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.training_partner_invitations
  set status = 'cancelled', responded_at = now()
  where id = invitation_id
    and sender_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Training invitation is no longer available';
  end if;
end;
$$;

revoke all on function public.respond_to_training_partner_invitation(uuid, text, uuid) from public;
revoke all on function public.cancel_training_partner_invitation(uuid) from public;
grant execute on function public.respond_to_training_partner_invitation(uuid, text, uuid) to authenticated;
grant execute on function public.cancel_training_partner_invitation(uuid) to authenticated;
grant select, insert on public.training_partner_invitations to authenticated;
grant all on public.training_partner_invitations to service_role;
