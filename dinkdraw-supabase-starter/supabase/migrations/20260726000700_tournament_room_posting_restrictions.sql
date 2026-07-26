-- Let tournament organizers restrict an individual player from posting in one
-- tournament room without removing their access to messages or announcements.

create table public.tournament_room_posting_restrictions (
  room_id uuid not null references public.tournament_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  restricted_by_user_id uuid references auth.users(id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.tournament_room_posting_restrictions enable row level security;

create policy "Managers and affected users can view posting restrictions"
on public.tournament_room_posting_restrictions
for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_manage_tournament_room(room_id)
);

revoke all on table public.tournament_room_posting_restrictions from anon;
revoke all on table public.tournament_room_posting_restrictions from authenticated;
grant select on table public.tournament_room_posting_restrictions to authenticated;
grant all on table public.tournament_room_posting_restrictions to service_role;

alter table public.tournament_room_moderation_actions
drop constraint tournament_room_moderation_actions_action_type_check;

alter table public.tournament_room_moderation_actions
add constraint tournament_room_moderation_actions_action_type_check
check (
  action_type in (
    'message_deleted_by_sender',
    'message_removed_by_manager',
    'report_reviewing',
    'report_resolved',
    'report_dismissed',
    'conversation_enabled',
    'conversation_disabled',
    'conversation_close_scheduled',
    'player_posting_restricted',
    'player_posting_restored'
  )
);

create or replace function public.set_tournament_room_posting_restriction(
  p_room_id uuid,
  p_user_id uuid,
  p_restricted boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reason text;
  target_tournament_id uuid;
begin
  if auth.uid() is null or not public.can_manage_tournament_room(p_room_id) then
    raise exception 'Only a tournament organizer can change posting access';
  end if;

  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Choose another player';
  end if;

  select tournament_rooms.tournament_id
  into target_tournament_id
  from public.tournament_rooms
  where tournament_rooms.id = p_room_id
    and tournament_rooms.archived_at is null;

  if target_tournament_id is null then
    raise exception 'Tournament room not found';
  end if;

  if exists (
    select 1
    from public.tournaments
    where tournaments.id = target_tournament_id
      and (
        tournaments.organizer_user_id = p_user_id
        or tournaments.co_organizer_user_id = p_user_id
      )
  ) then
    raise exception 'Organizer posting access cannot be restricted';
  end if;

  if not exists (
    select 1
    from public.tournament_players
    where tournament_players.tournament_id = target_tournament_id
      and tournament_players.claimed_by_user_id = p_user_id
  ) then
    raise exception 'This user is not a claimed player in the tournament';
  end if;

  clean_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if clean_reason is not null and char_length(clean_reason) > 500 then
    raise exception 'Reason must be 500 characters or fewer';
  end if;

  if p_restricted then
    insert into public.tournament_room_posting_restrictions (
      room_id,
      user_id,
      restricted_by_user_id,
      reason
    )
    values (
      p_room_id,
      p_user_id,
      auth.uid(),
      clean_reason
    )
    on conflict (room_id, user_id) do update
    set
      restricted_by_user_id = excluded.restricted_by_user_id,
      reason = excluded.reason,
      created_at = now();
  else
    delete from public.tournament_room_posting_restrictions
    where tournament_room_posting_restrictions.room_id = p_room_id
      and tournament_room_posting_restrictions.user_id = p_user_id;
  end if;

  insert into public.tournament_room_moderation_actions (
    room_id,
    actor_user_id,
    target_user_id,
    action_type,
    reason
  )
  values (
    p_room_id,
    auth.uid(),
    p_user_id,
    case
      when p_restricted then 'player_posting_restricted'
      else 'player_posting_restored'
    end,
    clean_reason
  );

  -- Existing room Realtime subscribers use this update as a safe refresh signal.
  update public.tournament_rooms
  set updated_at = now()
  where tournament_rooms.id = p_room_id;

  return true;
end;
$$;

create or replace function public.post_tournament_room_message(
  p_room_id uuid,
  p_body text
)
returns table (
  id uuid,
  room_id uuid,
  sender_user_id uuid,
  message_type text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_body text;
begin
  if auth.uid() is null or not public.can_access_tournament_room(p_room_id) then
    raise exception 'Not authorized';
  end if;

  if exists (
    select 1
    from public.tournament_room_posting_restrictions
    where tournament_room_posting_restrictions.room_id = p_room_id
      and tournament_room_posting_restrictions.user_id = auth.uid()
  ) then
    raise exception 'You can read this conversation, but posting is currently unavailable';
  end if;

  if not exists (
    select 1
    from public.tournament_rooms
    where tournament_rooms.id = p_room_id
      and tournament_rooms.archived_at is null
      and tournament_rooms.posting_mode = 'conversation'
      and tournament_rooms.conversation_closed_at is null
      and (
        tournament_rooms.conversation_closes_at is null
        or tournament_rooms.conversation_closes_at > now()
      )
  ) then
    raise exception 'Conversation is not open';
  end if;

  clean_body := btrim(coalesce(p_body, ''));
  if char_length(clean_body) < 1 or char_length(clean_body) > 1000 then
    raise exception 'Message must be between 1 and 1000 characters';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || p_room_id::text, 0)
  );

  if (
    select count(*)
    from public.tournament_room_messages
    where tournament_room_messages.room_id = p_room_id
      and tournament_room_messages.sender_user_id = auth.uid()
      and tournament_room_messages.message_type = 'message'
      and tournament_room_messages.created_at > now() - interval '1 minute'
  ) >= 8 then
    raise exception 'Too many messages. Please wait a moment.';
  end if;

  if (
    select count(*)
    from public.tournament_room_messages
    where tournament_room_messages.room_id = p_room_id
      and tournament_room_messages.sender_user_id = auth.uid()
      and tournament_room_messages.message_type = 'message'
      and tournament_room_messages.created_at > now() - interval '10 minutes'
  ) >= 30 then
    raise exception 'Message limit reached. Please wait before sending more.';
  end if;

  return query
  insert into public.tournament_room_messages (
    room_id,
    sender_user_id,
    message_type,
    body
  )
  values (
    p_room_id,
    auth.uid(),
    'message',
    clean_body
  )
  returning
    tournament_room_messages.id,
    tournament_room_messages.room_id,
    tournament_room_messages.sender_user_id,
    tournament_room_messages.message_type,
    tournament_room_messages.body,
    tournament_room_messages.created_at;
end;
$$;

revoke all on function public.set_tournament_room_posting_restriction(uuid, uuid, boolean, text)
from public;
revoke all on function public.set_tournament_room_posting_restriction(uuid, uuid, boolean, text)
from anon;
grant execute on function public.set_tournament_room_posting_restriction(uuid, uuid, boolean, text)
to authenticated;
grant execute on function public.set_tournament_room_posting_restriction(uuid, uuid, boolean, text)
to service_role;

comment on table public.tournament_room_posting_restrictions
is 'Room-specific posting restrictions; affected players retain read access.';

notify pgrst, 'reload schema';
