-- Internal Phase 1 foundation: private, text-only, announcement-only rooms.
-- No application navigation or push-notification behavior is enabled here.

create table public.tournament_rooms (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references public.tournaments(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  posting_mode text not null default 'announcements_only'
    check (posting_mode in ('announcements_only', 'conversation')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.tournament_rooms(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  message_type text not null default 'announcement'
    check (message_type in ('announcement', 'message', 'system')),
  body text not null
    check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.tournament_room_user_state (
  room_id uuid not null references public.tournament_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  is_muted boolean not null default false,
  push_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index tournament_room_messages_room_created_idx
on public.tournament_room_messages(room_id, created_at desc);

create index tournament_room_messages_sender_created_idx
on public.tournament_room_messages(sender_user_id, created_at desc)
where sender_user_id is not null;

create index tournament_room_user_state_user_idx
on public.tournament_room_user_state(user_id);

alter table public.tournament_rooms enable row level security;
alter table public.tournament_room_messages enable row level security;
alter table public.tournament_room_user_state enable row level security;

create or replace function public.can_access_tournament_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_rooms
    join public.tournaments
      on tournaments.id = tournament_rooms.tournament_id
    where tournament_rooms.id = p_room_id
      and tournament_rooms.archived_at is null
      and (
        tournaments.organizer_user_id = auth.uid()
        or tournaments.co_organizer_user_id = auth.uid()
        or exists (
          select 1
          from public.tournament_players
          where tournament_players.tournament_id = tournaments.id
            and tournament_players.claimed_by_user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_post_tournament_announcement(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_rooms
    join public.tournaments
      on tournaments.id = tournament_rooms.tournament_id
    where tournament_rooms.id = p_room_id
      and tournament_rooms.archived_at is null
      and tournament_rooms.posting_mode = 'announcements_only'
      and (
        tournaments.organizer_user_id = auth.uid()
        or tournaments.co_organizer_user_id = auth.uid()
      )
  );
$$;

revoke all on function public.can_access_tournament_room(uuid) from public;
revoke all on function public.can_access_tournament_room(uuid) from anon;
grant execute on function public.can_access_tournament_room(uuid) to authenticated;
grant execute on function public.can_access_tournament_room(uuid) to service_role;

revoke all on function public.can_post_tournament_announcement(uuid) from public;
revoke all on function public.can_post_tournament_announcement(uuid) from anon;
grant execute on function public.can_post_tournament_announcement(uuid) to authenticated;
grant execute on function public.can_post_tournament_announcement(uuid) to service_role;

create policy "Eligible users can view tournament rooms"
on public.tournament_rooms
for select
to authenticated
using (public.can_access_tournament_room(id));

create policy "Eligible users can view tournament room messages"
on public.tournament_room_messages
for select
to authenticated
using (public.can_access_tournament_room(room_id));

create policy "Tournament managers can delete announcements"
on public.tournament_room_messages
for delete
to authenticated
using (public.can_post_tournament_announcement(room_id));

create policy "Eligible users manage their room state"
on public.tournament_room_user_state
for all
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_tournament_room(room_id)
)
with check (
  user_id = auth.uid()
  and public.can_access_tournament_room(room_id)
);

create or replace function public.post_tournament_announcement(
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
  if auth.uid() is null or not public.can_post_tournament_announcement(p_room_id) then
    raise exception 'Not authorized';
  end if;

  clean_body := btrim(coalesce(p_body, ''));

  if char_length(clean_body) < 1 or char_length(clean_body) > 2000 then
    raise exception 'Announcement must be between 1 and 2000 characters';
  end if;

  if (
    select count(*)
    from public.tournament_room_messages recent_messages
    where recent_messages.room_id = p_room_id
      and recent_messages.sender_user_id = auth.uid()
      and recent_messages.created_at > now() - interval '1 minute'
  ) >= 10 then
    raise exception 'Too many announcements. Please wait a moment.';
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
    'announcement',
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

revoke all on function public.post_tournament_announcement(uuid, text) from public;
revoke all on function public.post_tournament_announcement(uuid, text) from anon;
grant execute on function public.post_tournament_announcement(uuid, text) to authenticated;
grant execute on function public.post_tournament_announcement(uuid, text) to service_role;

create or replace function public.create_tournament_room_after_tournament()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tournament_rooms (
    tournament_id,
    created_by_user_id
  )
  values (
    new.id,
    new.organizer_user_id
  )
  on conflict (tournament_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_tournament_room_after_tournament() from public;
revoke all on function public.create_tournament_room_after_tournament() from anon;
revoke all on function public.create_tournament_room_after_tournament() from authenticated;

drop trigger if exists create_tournament_room_after_insert
on public.tournaments;

create trigger create_tournament_room_after_insert
after insert on public.tournaments
for each row
execute function public.create_tournament_room_after_tournament();

insert into public.tournament_rooms (
  tournament_id,
  created_by_user_id
)
select
  tournaments.id,
  tournaments.organizer_user_id
from public.tournaments
on conflict (tournament_id) do nothing;

revoke all on table public.tournament_rooms from anon;
revoke all on table public.tournament_rooms from authenticated;
grant select on table public.tournament_rooms to authenticated;
grant all on table public.tournament_rooms to service_role;

revoke all on table public.tournament_room_messages from anon;
revoke all on table public.tournament_room_messages from authenticated;
grant select, delete on table public.tournament_room_messages to authenticated;
grant all on table public.tournament_room_messages to service_role;

revoke all on table public.tournament_room_user_state from anon;
revoke all on table public.tournament_room_user_state from authenticated;
grant select, insert, update, delete on table public.tournament_room_user_state to authenticated;
grant all on table public.tournament_room_user_state to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_room_messages'
  ) then
    alter publication supabase_realtime
    add table public.tournament_room_messages;
  end if;
end;
$$;

comment on table public.tournament_rooms
is 'Private per-tournament room. Phase 1 uses announcements_only mode.';

comment on table public.tournament_room_messages
is 'Text-only tournament room messages. Phase 1 permits announcements through a protected RPC.';

comment on table public.tournament_room_user_state
is 'Per-user read, mute, and future push preferences for an eligible tournament room.';

notify pgrst, 'reload schema';
