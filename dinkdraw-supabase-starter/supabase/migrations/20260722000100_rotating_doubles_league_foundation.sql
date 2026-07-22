create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organizer_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  join_code text not null unique,
  league_format text not null default 'rotating_doubles'
    check (league_format in ('rotating_doubles', 'permanent_teams')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'archived')),
  start_date date not null,
  end_date date,
  session_count integer not null check (session_count between 1 and 52),
  regular_player_count integer not null
    check (regular_player_count between 4 and 32 and regular_player_count % 2 = 0),
  courts integer not null check (courts between 1 and 16),
  matches_per_opponent integer not null default 2 check (matches_per_opponent between 1 and 5),
  games_to integer not null default 11 check (games_to between 1 and 99),
  default_time text,
  default_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text,
  dupr_id text,
  member_type text not null default 'regular'
    check (member_type in ('regular', 'substitute')),
  roster_position integer,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, user_id),
  unique (league_id, roster_position),
  check (
    (member_type = 'regular' and roster_position is not null)
    or (member_type = 'substitute' and roster_position is null)
  )
);

create table public.league_sessions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  session_number integer not null,
  scheduled_date date not null,
  scheduled_time text,
  location text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'attendance_open', 'teams_published', 'in_progress', 'completed', 'cancelled')),
  tournament_id uuid references public.tournaments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, session_number)
);

create table public.league_session_attendance (
  session_id uuid not null references public.league_sessions(id) on delete cascade,
  regular_member_id uuid not null references public.league_members(id) on delete cascade,
  attendance_status text not null default 'expected'
    check (attendance_status in ('expected', 'playing', 'unsure', 'sub_needed', 'sub_invited', 'sub_confirmed', 'absent', 'completed')),
  substitute_member_id uuid references public.league_members(id) on delete set null,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  substitute_accepted_at timestamptz,
  organizer_confirmed_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (session_id, regular_member_id),
  unique (session_id, substitute_member_id)
);

create table public.league_session_teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.league_sessions(id) on delete cascade,
  team_number integer not null,
  regular_player_1_id uuid not null references public.league_members(id) on delete cascade,
  regular_player_2_id uuid not null references public.league_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, team_number),
  check (regular_player_1_id <> regular_player_2_id)
);

create table public.league_session_players (
  session_id uuid not null references public.league_sessions(id) on delete cascade,
  team_number integer not null,
  regular_member_id uuid not null references public.league_members(id) on delete cascade,
  actual_member_id uuid not null references public.league_members(id) on delete restrict,
  tournament_player_id uuid not null references public.tournament_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, regular_member_id),
  unique (session_id, actual_member_id),
  unique (tournament_player_id)
);

create table public.league_substitute_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.league_sessions(id) on delete cascade,
  regular_member_id uuid not null references public.league_members(id) on delete cascade,
  substitute_member_id uuid not null references public.league_members(id) on delete cascade,
  responded_by_user_id uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null,
  responded_at timestamptz not null default now(),
  push_sent_at timestamptz
);

create index leagues_organization_idx on public.leagues(organization_id, created_at desc);
create index league_members_user_idx on public.league_members(user_id) where user_id is not null;
create index league_sessions_date_idx on public.league_sessions(league_id, scheduled_date);

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_sessions enable row level security;
alter table public.league_session_attendance enable row level security;
alter table public.league_session_teams enable row level security;
alter table public.league_session_players enable row level security;
alter table public.league_substitute_responses enable row level security;

create or replace function public.protect_league_identity_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.organizer_user_id is distinct from old.organizer_user_id
    or new.league_format is distinct from old.league_format
    or new.regular_player_count is distinct from old.regular_player_count
  then raise exception 'League ownership, format, and roster size cannot be changed';
  end if;
  return new;
end;
$$;

create trigger protect_league_identity_fields_before_update
before update on public.leagues
for each row execute function public.protect_league_identity_fields();

create or replace function public.protect_league_member_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.league_id is distinct from old.league_id
    or new.member_type is distinct from old.member_type
    or new.roster_position is distinct from old.roster_position
  then raise exception 'League member type and roster position cannot be changed'; end if;
  if new.user_id is distinct from old.user_id
    and not (old.user_id is null and new.user_id = auth.uid() and old.member_type = 'regular')
  then raise exception 'League member account cannot be reassigned'; end if;
  return new;
end;
$$;

create trigger protect_league_member_identity_before_update
before update on public.league_members
for each row execute function public.protect_league_member_identity();

create or replace function public.validate_league_attendance_members()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_league_id uuid;
begin
  select league_id into target_league_id from public.league_sessions
  where id = new.session_id and tournament_id is null;
  if target_league_id is null then raise exception 'Attendance is locked after the live tournament is created'; end if;
  if not exists (
    select 1 from public.league_members
    where id = new.regular_member_id and league_id = target_league_id and member_type = 'regular'
  ) then raise exception 'Attendance regular player does not belong to this league'; end if;
  if new.substitute_member_id is not null and not exists (
    select 1 from public.league_members
    where id = new.substitute_member_id and league_id = target_league_id and member_type = 'substitute'
  ) then raise exception 'Attendance substitute does not belong to this league'; end if;
  return new;
end;
$$;

create trigger validate_league_attendance_members_before_write
before insert or update on public.league_session_attendance
for each row execute function public.validate_league_attendance_members();

create or replace function public.validate_league_team_members()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_league_id uuid;
begin
  select league_id into target_league_id from public.league_sessions
  where id = new.session_id and tournament_id is null;
  if target_league_id is null then raise exception 'Teams are locked after the live tournament is created'; end if;
  if exists (
    select 1 from unnest(array[new.regular_player_1_id, new.regular_player_2_id]) member_id
    where not exists (
      select 1 from public.league_members
      where id = member_id and league_id = target_league_id and member_type = 'regular'
    )
  ) then raise exception 'Team player does not belong to this league'; end if;
  return new;
end;
$$;

create trigger validate_league_team_members_before_write
before insert or update on public.league_session_teams
for each row execute function public.validate_league_team_members();

create or replace function public.can_manage_league(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leagues
    where leagues.id = p_league_id
      and leagues.organizer_user_id = auth.uid()
  );
$$;

create or replace function public.can_access_league(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leagues
    where leagues.id = p_league_id
      and leagues.organizer_user_id = auth.uid()
  ) or exists (
    select 1
    from public.league_members
    where league_members.league_id = p_league_id
      and league_members.user_id = auth.uid()
      and league_members.status <> 'inactive'
  );
$$;

create or replace function public.create_rotating_doubles_league(
  p_organization_id uuid,
  p_name text,
  p_start_date date,
  p_session_count integer,
  p_regular_player_count integer,
  p_courts integer,
  p_games_to integer,
  p_default_time text default null,
  p_default_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_league_id uuid;
  generated_join_code text;
  member_ids uuid[];
  rotation_member_ids uuid[];
  target_session_id uuid;
  session_index integer;
  team_index integer;
  rotation_position integer;
  source_index integer;
  cycle_length integer;
  cycle_index integer;
  cycle_number integer;
  rotation_offset integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a league';
  end if;

  if not exists (
    select 1
    from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only an organization owner or admin can create a league';
  end if;

  if not exists (
    select 1
    from public.feature_entitlements
    where organization_id = p_organization_id
      and feature_key = 'league_mode'
      and status = 'active'
      and (expires_at is null or expires_at > now())
  ) then
    raise exception 'This organization does not have League access';
  end if;

  if p_regular_player_count < 4 or p_regular_player_count > 32 or p_regular_player_count % 2 <> 0 then
    raise exception 'Rotating doubles requires an even roster of 4 to 32 players';
  end if;

  if p_session_count < 1 or p_session_count > 52 then
    raise exception 'Session count must be between 1 and 52';
  end if;

  if p_courts <> floor(p_regular_player_count / 4.0) then
    raise exception 'This roster requires % courts so every team can rotate together', floor(p_regular_player_count / 4.0);
  end if;

  loop
    generated_join_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.leagues where join_code = generated_join_code);
  end loop;

  insert into public.leagues (
    organization_id, organizer_user_id, name, join_code, start_date,
    end_date, session_count, regular_player_count, courts, games_to,
    matches_per_opponent, default_time, default_location
  ) values (
    p_organization_id, auth.uid(), btrim(p_name), generated_join_code, p_start_date,
    p_start_date + ((p_session_count - 1) * 7), p_session_count,
    p_regular_player_count, p_courts, p_games_to, 2,
    nullif(btrim(p_default_time), ''), nullif(btrim(p_default_location), '')
  ) returning id into created_league_id;

  insert into public.league_members (league_id, member_type, roster_position, status)
  select created_league_id, 'regular', position, 'invited'
  from generate_series(1, p_regular_player_count) as position;

  insert into public.league_sessions (
    league_id, session_number, scheduled_date, scheduled_time, location
  )
  select
    created_league_id,
    session_number,
    p_start_date + ((session_number - 1) * 7),
    nullif(btrim(p_default_time), ''),
    nullif(btrim(p_default_location), '')
  from generate_series(1, p_session_count) as session_number;

  insert into public.league_session_attendance (session_id, regular_member_id)
  select league_sessions.id, league_members.id
  from public.league_sessions
  cross join public.league_members
  where league_sessions.league_id = created_league_id
    and league_members.league_id = created_league_id
    and league_members.member_type = 'regular';

  select array_agg(id order by roster_position) into member_ids
  from public.league_members
  where league_id = created_league_id and member_type = 'regular';

  cycle_length := p_regular_player_count - 1;
  for session_index in 1..p_session_count loop
    cycle_index := mod(session_index - 1, cycle_length);
    cycle_number := floor((session_index - 1)::numeric / cycle_length)::integer;
    rotation_offset := mod(cycle_index + cycle_number, cycle_length);
    rotation_member_ids := array[member_ids[1]];

    for rotation_position in 0..(cycle_length - 1) loop
      source_index := 2 + mod(rotation_position + rotation_offset, cycle_length);
      rotation_member_ids := rotation_member_ids || member_ids[source_index];
    end loop;

    select id into target_session_id from public.league_sessions
    where league_id = created_league_id and session_number = session_index;

    for team_index in 1..(p_regular_player_count / 2) loop
      insert into public.league_session_teams (
        session_id, team_number, regular_player_1_id, regular_player_2_id
      ) values (
        target_session_id, team_index,
        rotation_member_ids[team_index], rotation_member_ids[p_regular_player_count + 1 - team_index]
      );
    end loop;
  end loop;

  return created_league_id;
end;
$$;

create policy "League members can read leagues"
on public.leagues for select to authenticated
using (public.can_access_league(id));

create policy "League organizers can update leagues"
on public.leagues for update to authenticated
using (public.can_manage_league(id)) with check (public.can_manage_league(id));

create policy "League participants can read members"
on public.league_members for select to authenticated
using (public.can_access_league(league_id));

create policy "League organizers update members"
on public.league_members for update to authenticated
using (public.can_manage_league(league_id)) with check (public.can_manage_league(league_id));

create policy "League participants can read sessions"
on public.league_sessions for select to authenticated
using (public.can_access_league(league_id));

create policy "League participants can read attendance"
on public.league_session_attendance for select to authenticated
using (exists (
  select 1 from public.league_sessions
  where league_sessions.id = session_id
    and public.can_access_league(league_sessions.league_id)
));

create policy "League organizers update attendance"
on public.league_session_attendance for update to authenticated
using (exists (
  select 1 from public.league_sessions
  where league_sessions.id = session_id
    and public.can_manage_league(league_sessions.league_id)
)) with check (exists (
  select 1 from public.league_sessions
  where league_sessions.id = session_id
    and public.can_manage_league(league_sessions.league_id)
));

create policy "League participants can read teams"
on public.league_session_teams for select to authenticated
using (exists (
  select 1 from public.league_sessions
  where league_sessions.id = session_id
    and public.can_access_league(league_sessions.league_id)
));

create policy "League participants can read session player mappings"
on public.league_session_players for select to authenticated
using (exists (
  select 1 from public.league_sessions
  where league_sessions.id = session_id
    and public.can_access_league(league_sessions.league_id)
));

create policy "League participants can read substitute responses"
on public.league_substitute_responses for select to authenticated
using (exists (
  select 1 from public.league_sessions
  where league_sessions.id = session_id
    and public.can_access_league(league_sessions.league_id)
));

revoke all on function public.create_rotating_doubles_league(uuid, text, date, integer, integer, integer, integer, text, text) from public, anon;
grant execute on function public.create_rotating_doubles_league(uuid, text, date, integer, integer, integer, integer, text, text) to authenticated;
revoke all on function public.can_manage_league(uuid) from public, anon;
revoke all on function public.can_access_league(uuid) from public, anon;
grant execute on function public.can_manage_league(uuid) to authenticated;
grant execute on function public.can_access_league(uuid) to authenticated;

create or replace function public.claim_league_roster_spot(
  p_join_code text,
  p_roster_position integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
  profile_name text;
begin
  if auth.uid() is null then raise exception 'Sign in to join a league'; end if;

  select id into target_league_id
  from public.leagues
  where upper(join_code) = upper(btrim(p_join_code))
    and status in ('draft', 'active');

  if target_league_id is null then raise exception 'League code not found'; end if;
  if exists (select 1 from public.league_members where league_id = target_league_id and user_id = auth.uid()) then
    return target_league_id;
  end if;

  select display_name into profile_name from public.profiles where id = auth.uid();

  update public.league_members
  set user_id = auth.uid(), display_name = coalesce(nullif(btrim(profile_name), ''), display_name),
      status = 'active', updated_at = now()
  where league_id = target_league_id
    and member_type = 'regular'
    and roster_position = p_roster_position
    and user_id is null;

  if not found then raise exception 'That roster position is unavailable'; end if;
  return target_league_id;
end;
$$;

create or replace function public.add_league_substitute(
  p_league_id uuid,
  p_email text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  substitute_user_id uuid;
  substitute_id uuid;
begin
  if not public.can_manage_league(p_league_id) then raise exception 'Not authorized'; end if;
  if nullif(btrim(p_email), '') is null then raise exception 'Substitute email is required'; end if;

  select id into substitute_user_id
  from public.profiles
  where lower(email) = lower(btrim(p_email))
  limit 1;

  insert into public.league_members (league_id, user_id, display_name, member_type, status)
  values (
    p_league_id,
    substitute_user_id,
    coalesce(nullif(btrim(p_display_name), ''), nullif(split_part(btrim(p_email), '@', 1), '')),
    'substitute',
    case when substitute_user_id is null then 'invited' else 'active' end
  )
  returning id into substitute_id;

  return substitute_id;
end;
$$;

create or replace function public.set_my_league_attendance(
  p_session_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_id uuid;
begin
  if p_status not in ('playing', 'unsure', 'sub_needed') then raise exception 'Invalid attendance status'; end if;

  select league_members.id into member_id
  from public.league_sessions
  join public.league_members on league_members.league_id = league_sessions.league_id
  where league_sessions.id = p_session_id
    and league_sessions.tournament_id is null
    and league_sessions.status in ('scheduled', 'attendance_open', 'teams_published')
    and league_members.user_id = auth.uid()
    and league_members.member_type = 'regular';

  if member_id is null then raise exception 'You are not a regular player in this league'; end if;

  update public.league_session_attendance
  set attendance_status = p_status,
      substitute_member_id = case when p_status = 'sub_needed' then substitute_member_id else null end,
      requested_by_user_id = auth.uid(), note = nullif(btrim(p_note), ''),
      substitute_accepted_at = null, organizer_confirmed_at = null, updated_at = now()
  where session_id = p_session_id and regular_member_id = member_id;
end;
$$;

create or replace function public.respond_to_substitute_invitation(
  p_session_id uuid,
  p_regular_member_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  responding_substitute_id uuid;
begin
  select substitute.id into responding_substitute_id
    from public.league_session_attendance
    join public.league_members substitute on substitute.id = league_session_attendance.substitute_member_id
    where league_session_attendance.session_id = p_session_id
      and league_session_attendance.regular_member_id = p_regular_member_id
      and substitute.user_id = auth.uid()
      and league_session_attendance.attendance_status = 'sub_invited';
  if responding_substitute_id is null then raise exception 'Substitute invitation not found'; end if;

  insert into public.league_substitute_responses (
    session_id, regular_member_id, substitute_member_id, responded_by_user_id, accepted
  ) values (
    p_session_id, p_regular_member_id, responding_substitute_id, auth.uid(), p_accept
  );

  update public.league_session_attendance
  set attendance_status = case when p_accept then 'sub_confirmed' else 'sub_needed' end,
      substitute_member_id = case when p_accept then substitute_member_id else null end,
      substitute_accepted_at = case when p_accept then now() else null end,
      organizer_confirmed_at = null, updated_at = now()
  where session_id = p_session_id and regular_member_id = p_regular_member_id;
end;
$$;

revoke all on function public.claim_league_roster_spot(text, integer) from public, anon;
revoke all on function public.add_league_substitute(uuid, text, text) from public, anon;
revoke all on function public.set_my_league_attendance(uuid, text, text) from public, anon;
revoke all on function public.respond_to_substitute_invitation(uuid, uuid, boolean) from public, anon;
grant execute on function public.claim_league_roster_spot(text, integer) to authenticated;
grant execute on function public.add_league_substitute(uuid, text, text) to authenticated;
grant execute on function public.set_my_league_attendance(uuid, text, text) to authenticated;
grant execute on function public.respond_to_substitute_invitation(uuid, uuid, boolean) to authenticated;

create or replace function public.start_league_session_tournament(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  league_row public.leagues%rowtype;
  session_row public.league_sessions%rowtype;
  organizer_name text;
  created_tournament_id uuid;
  generated_join_code text;
  team_row record;
  regular_member_id uuid;
  actual_member_id uuid;
  actual_user_id uuid;
  actual_name text;
  actual_dupr_id text;
  created_player_id uuid;
  next_slot integer := 1;
  team_numbers integer[];
  rotation integer[];
  rotation_length integer;
  opponent_round integer;
  pairing_index integer;
  match_copy integer;
  team_a_number integer;
  team_b_number integer;
  court_number integer;
  team_a_players uuid[];
  team_b_players uuid[];
  court_labels text[];
begin
  select * into session_row from public.league_sessions where id = p_session_id for update;
  if session_row.id is null then raise exception 'League session not found'; end if;
  select * into league_row from public.leagues where id = session_row.league_id;

  if not public.can_manage_league(league_row.id) then raise exception 'Not authorized'; end if;
  if session_row.tournament_id is not null then return session_row.tournament_id; end if;
  if session_row.status = 'cancelled' then raise exception 'A cancelled session cannot be started'; end if;
  if league_row.status in ('completed', 'archived') or league_row.league_format <> 'rotating_doubles' then
    raise exception 'This league cannot start a rotating-doubles session';
  end if;

  if (select count(*) from public.league_session_attendance where session_id = p_session_id) <> league_row.regular_player_count then
    raise exception 'The session attendance roster is incomplete';
  end if;

  if exists (
    select 1 from public.league_session_attendance
    where session_id = p_session_id
      and attendance_status in ('sub_needed', 'sub_invited', 'unsure', 'absent')
  ) then raise exception 'Resolve all attendance and substitute requests before starting'; end if;

  if exists (
    select 1 from public.league_session_attendance
    where session_id = p_session_id
      and attendance_status = 'sub_confirmed'
      and organizer_confirmed_at is null
  ) then raise exception 'The organizer must confirm every accepted substitute'; end if;

  if exists (
    select 1 from public.league_members
    where league_id = league_row.id and member_type = 'regular'
      and (user_id is null or nullif(btrim(display_name), '') is null)
  ) then raise exception 'Every regular roster position must be claimed before starting'; end if;

  select array_agg(team_number order by team_number) into team_numbers
  from public.league_session_teams where session_id = p_session_id;
  if coalesce(array_length(team_numbers, 1), 0) <> league_row.regular_player_count / 2 then
    raise exception 'The weekly partnership plan is incomplete';
  end if;

  if (
    select count(distinct player_id)
    from (
      select regular_player_1_id as player_id from public.league_session_teams where session_id = p_session_id
      union all
      select regular_player_2_id from public.league_session_teams where session_id = p_session_id
    ) weekly_players
  ) <> league_row.regular_player_count then raise exception 'Every regular player must appear on exactly one weekly team'; end if;

  rotation := team_numbers;
  if array_length(rotation, 1) % 2 = 1 then rotation := rotation || 0; end if;
  rotation_length := array_length(rotation, 1);
  if league_row.courts < floor(array_length(team_numbers, 1) / 2.0) then
    raise exception 'This league needs at least % courts so every team can rotate together', floor(array_length(team_numbers, 1) / 2.0);
  end if;

  select display_name into organizer_name from public.profiles where id = league_row.organizer_user_id;
  loop
    generated_join_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.tournaments where join_code = generated_join_code);
  end loop;

  select array_agg('Court ' || number order by number) into court_labels
  from generate_series(1, league_row.courts) as number;

  insert into public.tournaments (
    title, organizer_user_id, organizer_name, join_code, player_count, courts, rounds,
    games_to, status, event_date, event_time, location, started_at, format, match_format,
    doubles_mode, is_public, allow_player_score_reporting, allow_any_player_score_reporting,
    court_labels, playoff_format, tournament_mode, organization_id
  ) values (
    league_row.name || ' — Week ' || session_row.session_number,
    league_row.organizer_user_id, coalesce(organizer_name, 'League Organizer'), generated_join_code,
    league_row.regular_player_count, league_row.courts, (rotation_length - 1) * 2,
    league_row.games_to, 'started', session_row.scheduled_date, session_row.scheduled_time,
    coalesce(session_row.location, league_row.default_location), now(), 'doubles', 'single',
    'fixed', false, true, true, court_labels, 'none', 'round_robin', league_row.organization_id
  ) returning id into created_tournament_id;

  for team_row in
    select * from public.league_session_teams where session_id = p_session_id order by team_number
  loop
    foreach regular_member_id in array array[team_row.regular_player_1_id, team_row.regular_player_2_id]
    loop
      select
        case when attendance.substitute_member_id is not null and attendance.organizer_confirmed_at is not null
          then attendance.substitute_member_id else regular_member_id end
      into actual_member_id
      from public.league_session_attendance attendance
      where attendance.session_id = p_session_id and attendance.regular_member_id = regular_member_id;

      select user_id, display_name, dupr_id into actual_user_id, actual_name, actual_dupr_id
      from public.league_members where id = actual_member_id;
      if actual_user_id is null then raise exception 'Every actual player must have a DinkDraw account'; end if;

      insert into public.tournament_players (
        tournament_id, slot_number, display_name, claimed_by_user_id, dupr_id
      ) values (
        created_tournament_id, next_slot, actual_name, actual_user_id, actual_dupr_id
      ) returning id into created_player_id;

      insert into public.league_session_players (
        session_id, team_number, regular_member_id, actual_member_id, tournament_player_id
      ) values (
        p_session_id, team_row.team_number, regular_member_id, actual_member_id, created_player_id
      );
      next_slot := next_slot + 1;
    end loop;
  end loop;

  for opponent_round in 1..(rotation_length - 1)
  loop
    court_number := 0;
    for pairing_index in 1..(rotation_length / 2)
    loop
      team_a_number := rotation[pairing_index];
      team_b_number := rotation[rotation_length + 1 - pairing_index];
      if team_a_number <> 0 and team_b_number <> 0 then
        court_number := court_number + 1;
        select array_agg(tournament_player_id order by tournament_player_id) into team_a_players
        from public.league_session_players where session_id = p_session_id and team_number = team_a_number;
        select array_agg(tournament_player_id order by tournament_player_id) into team_b_players
        from public.league_session_players where session_id = p_session_id and team_number = team_b_number;

        for match_copy in 1..2 loop
          insert into public.matches (
            tournament_id, round_number, court_number, court_label,
            team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id,
            is_bye, is_complete
          ) values (
            created_tournament_id, ((opponent_round - 1) * 2) + match_copy,
            court_number, court_labels[court_number],
            case when match_copy = 1 then team_a_players[1] else team_b_players[1] end,
            case when match_copy = 1 then team_a_players[2] else team_b_players[2] end,
            case when match_copy = 1 then team_b_players[1] else team_a_players[1] end,
            case when match_copy = 1 then team_b_players[2] else team_a_players[2] end,
            false, false
          );
        end loop;
      end if;
    end loop;
    rotation := array[rotation[1], rotation[rotation_length]] || rotation[2:rotation_length - 1];
  end loop;

  update public.league_sessions
  set tournament_id = created_tournament_id, status = 'in_progress', updated_at = now()
  where id = p_session_id;
  update public.leagues set status = 'active', updated_at = now() where id = league_row.id and status = 'draft';

  return created_tournament_id;
end;
$$;

revoke all on function public.start_league_session_tournament(uuid) from public, anon;
grant execute on function public.start_league_session_tournament(uuid) to authenticated;

create or replace function public.sync_completed_league_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    update public.league_sessions
    set status = 'completed', updated_at = now()
    where tournament_id = new.id and status <> 'completed';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_completed_league_session_after_tournament on public.tournaments;
create trigger sync_completed_league_session_after_tournament
after update of status on public.tournaments
for each row execute function public.sync_completed_league_session();

revoke all on function public.sync_completed_league_session() from public, anon, authenticated;

create or replace function public.get_league_standings(p_league_id uuid)
returns table (
  standing_rank bigint,
  regular_member_id uuid,
  display_name text,
  adjusted_wins numeric,
  point_differential bigint,
  total_wins bigint,
  regular_wins bigint,
  regular_sessions bigint,
  regular_average numeric,
  substitute_wins bigint,
  substitute_sessions bigint,
  substitute_average numeric,
  substitute_adjustment numeric,
  completed_sessions bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_access_league(p_league_id) then raise exception 'Not authorized'; end if;

  return query
  with player_match_results as (
    select
      mappings.regular_member_id,
      mappings.actual_member_id,
      mappings.session_id,
      case when matches.team_a_score > matches.team_b_score then 1 else 0 end::bigint as wins,
      (matches.team_a_score - matches.team_b_score)::bigint as point_diff
    from public.league_session_players mappings
    join public.league_sessions sessions on sessions.id = mappings.session_id and sessions.status = 'completed'
    join public.matches on matches.tournament_id = sessions.tournament_id
      and mappings.tournament_player_id in (matches.team_a_player_1_id, matches.team_a_player_2_id)
    where sessions.league_id = p_league_id and matches.is_complete and not matches.is_bye

    union all

    select
      mappings.regular_member_id,
      mappings.actual_member_id,
      mappings.session_id,
      case when matches.team_b_score > matches.team_a_score then 1 else 0 end::bigint as wins,
      (matches.team_b_score - matches.team_a_score)::bigint as point_diff
    from public.league_session_players mappings
    join public.league_sessions sessions on sessions.id = mappings.session_id and sessions.status = 'completed'
    join public.matches on matches.tournament_id = sessions.tournament_id
      and mappings.tournament_player_id in (matches.team_b_player_1_id, matches.team_b_player_2_id)
    where sessions.league_id = p_league_id and matches.is_complete and not matches.is_bye
  ),
  member_totals as (
    select
      members.id as regular_member_id,
      coalesce(nullif(btrim(members.display_name), ''), 'Player ' || members.roster_position) as display_name,
      coalesce(sum(results.wins), 0)::bigint as total_wins,
      coalesce(sum(results.point_diff), 0)::bigint as point_differential,
      coalesce(sum(results.wins) filter (where results.actual_member_id = results.regular_member_id), 0)::bigint as regular_wins,
      (count(distinct results.session_id) filter (where results.actual_member_id = results.regular_member_id))::bigint as regular_sessions,
      coalesce(sum(results.wins) filter (where results.actual_member_id <> results.regular_member_id), 0)::bigint as substitute_wins,
      (count(distinct results.session_id) filter (where results.actual_member_id <> results.regular_member_id))::bigint as substitute_sessions,
      count(distinct results.session_id)::bigint as completed_sessions
    from public.league_members members
    left join player_match_results results on results.regular_member_id = members.id
    where members.league_id = p_league_id and members.member_type = 'regular'
    group by members.id, members.display_name, members.roster_position
  ),
  averages as (
    select totals.*,
      case when totals.regular_sessions = 0 then 0::numeric else totals.regular_wins::numeric / totals.regular_sessions end as regular_average,
      case when totals.substitute_sessions = 0 then 0::numeric else totals.substitute_wins::numeric / totals.substitute_sessions end as substitute_average
    from member_totals totals
  ),
  adjusted as (
    select averages.*,
      case when averages.substitute_sessions = 0 then 0::numeric
        else (least(averages.substitute_average, averages.regular_average) * averages.substitute_sessions) - averages.substitute_wins end as substitute_adjustment
    from averages
  ),
  final_rows as (
    select adjusted.*,
      adjusted.total_wins + adjusted.substitute_adjustment as adjusted_wins
    from adjusted
  )
  select
    rank() over (order by final_rows.adjusted_wins desc, final_rows.point_differential desc),
    final_rows.regular_member_id,
    final_rows.display_name,
    round(final_rows.adjusted_wins, 2),
    final_rows.point_differential,
    final_rows.total_wins,
    final_rows.regular_wins,
    final_rows.regular_sessions,
    round(final_rows.regular_average, 2),
    final_rows.substitute_wins,
    final_rows.substitute_sessions,
    round(final_rows.substitute_average, 2),
    round(final_rows.substitute_adjustment, 2),
    final_rows.completed_sessions
  from final_rows
  order by final_rows.adjusted_wins desc, final_rows.point_differential desc, final_rows.display_name;
end;
$$;

revoke all on function public.get_league_standings(uuid) from public, anon;
grant execute on function public.get_league_standings(uuid) to authenticated;

notify pgrst, 'reload schema';
