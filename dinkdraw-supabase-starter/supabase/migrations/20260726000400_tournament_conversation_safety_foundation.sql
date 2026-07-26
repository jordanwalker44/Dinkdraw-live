-- Phase 2A: invisible safety foundation for future tournament conversation.
-- This migration does not enable conversation in any room or add visible UI.

alter table public.tournament_rooms
add column conversation_enabled_at timestamptz,
add column conversation_enabled_by_user_id uuid references auth.users(id) on delete set null,
add column conversation_closes_at timestamptz,
add column conversation_closed_at timestamptz,
add column conversation_closed_by_user_id uuid references auth.users(id) on delete set null;

create table public.user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create index user_blocks_blocked_user_idx
on public.user_blocks(blocked_user_id);

create table public.tournament_room_message_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.tournament_rooms(id) on delete cascade,
  message_id uuid references public.tournament_room_messages(id) on delete set null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reported_user_id uuid references auth.users(id) on delete set null,
  reason text not null
    check (reason in ('harassment', 'spam', 'inappropriate', 'privacy', 'safety', 'other')),
  details text
    check (details is null or char_length(details) <= 500),
  message_body_snapshot text not null
    check (char_length(message_body_snapshot) between 1 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text
    check (resolution_note is null or char_length(resolution_note) <= 1000),
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, reporter_user_id)
);

create index tournament_room_reports_room_status_created_idx
on public.tournament_room_message_reports(room_id, status, created_at desc);

create index tournament_room_reports_reported_user_idx
on public.tournament_room_message_reports(reported_user_id, created_at desc)
where reported_user_id is not null;

create table public.tournament_room_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.tournament_rooms(id) on delete cascade,
  message_id uuid references public.tournament_room_messages(id) on delete set null,
  report_id uuid references public.tournament_room_message_reports(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action_type text not null
    check (
      action_type in (
        'message_deleted_by_sender',
        'message_removed_by_manager',
        'report_reviewing',
        'report_resolved',
        'report_dismissed',
        'conversation_enabled',
        'conversation_disabled',
        'conversation_close_scheduled'
      )
    ),
  reason text
    check (reason is null or char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);

create index tournament_room_moderation_actions_room_created_idx
on public.tournament_room_moderation_actions(room_id, created_at desc);

alter table public.user_blocks enable row level security;
alter table public.tournament_room_message_reports enable row level security;
alter table public.tournament_room_moderation_actions enable row level security;

create or replace function public.can_manage_tournament_room(p_room_id uuid)
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
      )
  );
$$;

create or replace function public.can_view_tournament_room_message(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_room_messages
    where tournament_room_messages.id = p_message_id
      and public.can_access_tournament_room(tournament_room_messages.room_id)
      and (
        tournament_room_messages.message_type <> 'message'
        or tournament_room_messages.sender_user_id is null
        or tournament_room_messages.sender_user_id = auth.uid()
        or not exists (
          select 1
          from public.user_blocks
          where user_blocks.blocker_user_id = auth.uid()
            and user_blocks.blocked_user_id = tournament_room_messages.sender_user_id
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
  select public.can_manage_tournament_room(p_room_id);
$$;

revoke all on function public.can_manage_tournament_room(uuid) from public;
revoke all on function public.can_manage_tournament_room(uuid) from anon;
grant execute on function public.can_manage_tournament_room(uuid) to authenticated;
grant execute on function public.can_manage_tournament_room(uuid) to service_role;

revoke all on function public.can_view_tournament_room_message(uuid) from public;
revoke all on function public.can_view_tournament_room_message(uuid) from anon;
grant execute on function public.can_view_tournament_room_message(uuid) to authenticated;
grant execute on function public.can_view_tournament_room_message(uuid) to service_role;

drop policy if exists "Eligible users can view tournament room messages"
on public.tournament_room_messages;

create policy "Eligible users can view permitted tournament room messages"
on public.tournament_room_messages
for select
to authenticated
using (public.can_view_tournament_room_message(id));

create policy "Users can view their own blocks"
on public.user_blocks
for select
to authenticated
using (blocker_user_id = auth.uid());

create policy "Reporters and DinkDraw admins can view reports"
on public.tournament_room_message_reports
for select
to authenticated
using (
  reporter_user_id = auth.uid()
  or public.is_dinkdraw_admin()
);

create policy "DinkDraw admins can view moderation actions"
on public.tournament_room_moderation_actions
for select
to authenticated
using (public.is_dinkdraw_admin());

create or replace function public.block_tournament_room_user(p_blocked_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if p_blocked_user_id is null or p_blocked_user_id = auth.uid() then
    raise exception 'Invalid user';
  end if;

  if not exists (
    select 1
    from public.tournament_rooms
    join public.tournaments
      on tournaments.id = tournament_rooms.tournament_id
    where public.can_access_tournament_room(tournament_rooms.id)
      and (
        tournaments.organizer_user_id = p_blocked_user_id
        or tournaments.co_organizer_user_id = p_blocked_user_id
        or exists (
          select 1
          from public.tournament_players
          where tournament_players.tournament_id = tournaments.id
            and tournament_players.claimed_by_user_id = p_blocked_user_id
        )
      )
  ) then
    raise exception 'User does not share an eligible tournament room';
  end if;

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (auth.uid(), p_blocked_user_id)
  on conflict (blocker_user_id, blocked_user_id) do nothing;

  return true;
end;
$$;

create or replace function public.unblock_tournament_room_user(p_blocked_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  delete from public.user_blocks
  where user_blocks.blocker_user_id = auth.uid()
    and user_blocks.blocked_user_id = p_blocked_user_id;

  return found;
end;
$$;

create or replace function public.report_tournament_room_message(
  p_message_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_message public.tournament_room_messages%rowtype;
  clean_reason text;
  clean_details text;
  new_report_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select *
  into target_message
  from public.tournament_room_messages
  where tournament_room_messages.id = p_message_id;

  if not found or not public.can_access_tournament_room(target_message.room_id) then
    raise exception 'Message not found';
  end if;

  if target_message.sender_user_id is null
     or target_message.sender_user_id = auth.uid() then
    raise exception 'You cannot report this message';
  end if;

  clean_reason := lower(btrim(coalesce(p_reason, '')));
  if clean_reason not in ('harassment', 'spam', 'inappropriate', 'privacy', 'safety', 'other') then
    raise exception 'Invalid report reason';
  end if;

  clean_details := nullif(btrim(coalesce(p_details, '')), '');
  if clean_details is not null and char_length(clean_details) > 500 then
    raise exception 'Report details must be 500 characters or fewer';
  end if;

  if (
    select count(*)
    from public.tournament_room_message_reports
    where tournament_room_message_reports.reporter_user_id = auth.uid()
      and tournament_room_message_reports.created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'Too many reports. Please contact support if there is an immediate safety concern.';
  end if;

  insert into public.tournament_room_message_reports (
    room_id,
    message_id,
    reporter_user_id,
    reported_user_id,
    reason,
    details,
    message_body_snapshot
  )
  values (
    target_message.room_id,
    target_message.id,
    auth.uid(),
    target_message.sender_user_id,
    clean_reason,
    clean_details,
    target_message.body
  )
  on conflict (message_id, reporter_user_id) do update
  set
    message_id = tournament_room_message_reports.message_id
  returning id into new_report_id;

  return new_report_id;
end;
$$;

create or replace function public.delete_tournament_room_message(
  p_message_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_message public.tournament_room_messages%rowtype;
  manager_deletion boolean;
  clean_reason text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select *
  into target_message
  from public.tournament_room_messages
  where tournament_room_messages.id = p_message_id;

  if not found then
    return false;
  end if;

  manager_deletion := public.can_manage_tournament_room(target_message.room_id);
  if not manager_deletion and not (
    target_message.sender_user_id = auth.uid()
    and target_message.message_type = 'message'
  ) then
    raise exception 'Not authorized to delete this message';
  end if;

  clean_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if clean_reason is not null and char_length(clean_reason) > 1000 then
    raise exception 'Deletion reason must be 1000 characters or fewer';
  end if;

  insert into public.tournament_room_moderation_actions (
    room_id,
    message_id,
    actor_user_id,
    target_user_id,
    action_type,
    reason
  )
  values (
    target_message.room_id,
    target_message.id,
    auth.uid(),
    target_message.sender_user_id,
    case
      when manager_deletion then 'message_removed_by_manager'
      else 'message_deleted_by_sender'
    end,
    clean_reason
  );

  delete from public.tournament_room_messages
  where tournament_room_messages.id = target_message.id;

  return found;
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

  -- Serialize this sender's posts in this room so simultaneous requests cannot
  -- bypass the rate limits below.
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

create or replace function public.set_tournament_room_conversation(
  p_room_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.tournament_rooms%rowtype;
  target_tournament public.tournaments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if p_enabled is null then
    raise exception 'Conversation setting is required';
  end if;

  select *
  into target_room
  from public.tournament_rooms
  where tournament_rooms.id = p_room_id
    and tournament_rooms.archived_at is null;

  if not found then
    raise exception 'Room not found';
  end if;

  select *
  into target_tournament
  from public.tournaments
  where tournaments.id = target_room.tournament_id;

  if target_tournament.organizer_user_id <> auth.uid() then
    raise exception 'Only the tournament organizer can change conversation mode';
  end if;

  if p_enabled then
    update public.tournament_rooms
    set
      posting_mode = 'conversation',
      conversation_enabled_at = now(),
      conversation_enabled_by_user_id = auth.uid(),
      conversation_closes_at = case
        when target_tournament.status = 'completed' then now() + interval '7 days'
        else null
      end,
      conversation_closed_at = null,
      conversation_closed_by_user_id = null,
      updated_at = now()
    where tournament_rooms.id = p_room_id;

    insert into public.tournament_room_moderation_actions (
      room_id,
      actor_user_id,
      action_type
    )
    values (
      p_room_id,
      auth.uid(),
      'conversation_enabled'
    );
  else
    update public.tournament_rooms
    set
      posting_mode = 'announcements_only',
      conversation_closed_at = now(),
      conversation_closed_by_user_id = auth.uid(),
      updated_at = now()
    where tournament_rooms.id = p_room_id;

    insert into public.tournament_room_moderation_actions (
      room_id,
      actor_user_id,
      action_type
    )
    values (
      p_room_id,
      auth.uid(),
      'conversation_disabled'
    );
  end if;

  return true;
end;
$$;

create or replace function public.review_tournament_room_report(
  p_report_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report public.tournament_room_message_reports%rowtype;
  clean_status text;
  clean_note text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select *
  into target_report
  from public.tournament_room_message_reports
  where tournament_room_message_reports.id = p_report_id;

  if not found then
    raise exception 'Report not found';
  end if;

  if not public.can_manage_tournament_room(target_report.room_id)
     and not public.is_dinkdraw_admin() then
    raise exception 'Not authorized to review this report';
  end if;

  clean_status := lower(btrim(coalesce(p_status, '')));
  if clean_status not in ('reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  clean_note := nullif(btrim(coalesce(p_resolution_note, '')), '');
  if clean_note is not null and char_length(clean_note) > 1000 then
    raise exception 'Resolution note must be 1000 characters or fewer';
  end if;

  update public.tournament_room_message_reports
  set
    status = clean_status,
    resolution_note = clean_note,
    resolved_by_user_id = auth.uid(),
    resolved_at = case when clean_status in ('resolved', 'dismissed') then now() else null end,
    updated_at = now()
  where tournament_room_message_reports.id = p_report_id;

  insert into public.tournament_room_moderation_actions (
    room_id,
    message_id,
    report_id,
    actor_user_id,
    target_user_id,
    action_type,
    reason
  )
  values (
    target_report.room_id,
    target_report.message_id,
    target_report.id,
    auth.uid(),
    target_report.reported_user_id,
    case clean_status
      when 'reviewing' then 'report_reviewing'
      when 'resolved' then 'report_resolved'
      else 'report_dismissed'
    end,
    clean_note
  );

  return true;
end;
$$;

create or replace function public.get_tournament_room_reports(p_room_id uuid)
returns table (
  id uuid,
  message_id uuid,
  reported_user_id uuid,
  reason text,
  details text,
  message_body_snapshot text,
  status text,
  resolution_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_tournament_room(p_room_id)
     and not public.is_dinkdraw_admin() then
    raise exception 'Not authorized to view reports';
  end if;

  return query
  select
    reports.id,
    reports.message_id,
    reports.reported_user_id,
    reports.reason,
    reports.details,
    reports.message_body_snapshot,
    reports.status,
    reports.resolution_note,
    reports.created_at,
    reports.updated_at
  from public.tournament_room_message_reports reports
  where reports.room_id = p_room_id
  order by
    case reports.status when 'pending' then 0 when 'reviewing' then 1 else 2 end,
    reports.created_at desc;
end;
$$;

create or replace function public.close_completed_tournament_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_room_id uuid;
begin
  if new.status = 'completed'
     and old.status is distinct from new.status then
    update public.tournament_rooms
    set
      conversation_closes_at = now() + interval '7 days',
      updated_at = now()
    where tournament_rooms.tournament_id = new.id
      and tournament_rooms.posting_mode = 'conversation'
      and tournament_rooms.archived_at is null
    returning id into affected_room_id;

    if affected_room_id is not null then
      insert into public.tournament_room_moderation_actions (
        room_id,
        actor_user_id,
        action_type,
        reason
      )
      values (
        affected_room_id,
        auth.uid(),
        'conversation_close_scheduled',
        'Conversation scheduled to become read-only 7 days after tournament completion.'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists schedule_tournament_conversation_close
on public.tournaments;

create trigger schedule_tournament_conversation_close
after update of status on public.tournaments
for each row
execute function public.close_completed_tournament_conversation();

revoke all on function public.block_tournament_room_user(uuid) from public;
revoke all on function public.block_tournament_room_user(uuid) from anon;
grant execute on function public.block_tournament_room_user(uuid) to authenticated;
grant execute on function public.block_tournament_room_user(uuid) to service_role;

revoke all on function public.unblock_tournament_room_user(uuid) from public;
revoke all on function public.unblock_tournament_room_user(uuid) from anon;
grant execute on function public.unblock_tournament_room_user(uuid) to authenticated;
grant execute on function public.unblock_tournament_room_user(uuid) to service_role;

revoke all on function public.report_tournament_room_message(uuid, text, text) from public;
revoke all on function public.report_tournament_room_message(uuid, text, text) from anon;
grant execute on function public.report_tournament_room_message(uuid, text, text) to authenticated;
grant execute on function public.report_tournament_room_message(uuid, text, text) to service_role;

revoke all on function public.delete_tournament_room_message(uuid, text) from public;
revoke all on function public.delete_tournament_room_message(uuid, text) from anon;
grant execute on function public.delete_tournament_room_message(uuid, text) to authenticated;
grant execute on function public.delete_tournament_room_message(uuid, text) to service_role;

revoke all on function public.post_tournament_room_message(uuid, text) from public;
revoke all on function public.post_tournament_room_message(uuid, text) from anon;
revoke all on function public.post_tournament_room_message(uuid, text) from authenticated;
grant execute on function public.post_tournament_room_message(uuid, text) to service_role;

revoke all on function public.set_tournament_room_conversation(uuid, boolean) from public;
revoke all on function public.set_tournament_room_conversation(uuid, boolean) from anon;
revoke all on function public.set_tournament_room_conversation(uuid, boolean) from authenticated;
grant execute on function public.set_tournament_room_conversation(uuid, boolean) to service_role;

revoke all on function public.review_tournament_room_report(uuid, text, text) from public;
revoke all on function public.review_tournament_room_report(uuid, text, text) from anon;
grant execute on function public.review_tournament_room_report(uuid, text, text) to authenticated;
grant execute on function public.review_tournament_room_report(uuid, text, text) to service_role;

revoke all on function public.get_tournament_room_reports(uuid) from public;
revoke all on function public.get_tournament_room_reports(uuid) from anon;
grant execute on function public.get_tournament_room_reports(uuid) to authenticated;
grant execute on function public.get_tournament_room_reports(uuid) to service_role;

revoke all on function public.close_completed_tournament_conversation() from public;
revoke all on function public.close_completed_tournament_conversation() from anon;
revoke all on function public.close_completed_tournament_conversation() from authenticated;

revoke all on table public.user_blocks from anon;
revoke all on table public.user_blocks from authenticated;
grant select on table public.user_blocks to authenticated;
grant all on table public.user_blocks to service_role;

revoke all on table public.tournament_room_message_reports from anon;
revoke all on table public.tournament_room_message_reports from authenticated;
grant select on table public.tournament_room_message_reports to authenticated;
grant all on table public.tournament_room_message_reports to service_role;

revoke all on table public.tournament_room_moderation_actions from anon;
revoke all on table public.tournament_room_moderation_actions from authenticated;
grant select on table public.tournament_room_moderation_actions to authenticated;
grant all on table public.tournament_room_moderation_actions to service_role;

comment on table public.user_blocks
is 'Private per-user blocks used to hide future player conversation messages.';

comment on table public.tournament_room_message_reports
is 'User reports with a message snapshot retained for moderation review.';

comment on table public.tournament_room_moderation_actions
is 'Audit history for tournament room moderation and conversation lifecycle changes.';

notify pgrst, 'reload schema';
