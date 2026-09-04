alter table public.tournaments
  add column if not exists pool_postseason_format text not null default 'split',
  add column if not exists postseason_final_format text not null default 'carry_losses';

alter table public.tournaments
  drop constraint if exists tournaments_pool_postseason_format_check;

alter table public.tournaments
  add constraint tournaments_pool_postseason_format_check
  check (pool_postseason_format in ('split', 'single', 'single_consolation', 'double', 'triple'));

alter table public.tournaments
  drop constraint if exists tournaments_postseason_final_format_check;

alter table public.tournaments
  add constraint tournaments_postseason_final_format_check
  check (postseason_final_format in ('carry_losses', 'winner_take_all'));

alter table public.playoff_matches
  add column if not exists elimination_section text,
  add column if not exists template_key text,
  add column if not exists loser_next_match_id uuid references public.playoff_matches(id) on delete set null,
  add column if not exists loser_next_match_team text,
  add column if not exists team_a_losses integer not null default 0,
  add column if not exists team_b_losses integer not null default 0,
  add column if not exists elimination_limit integer not null default 1,
  add column if not exists is_conditional_final boolean not null default false;

alter table public.playoff_matches
  drop constraint if exists playoff_matches_elimination_section_check,
  drop constraint if exists playoff_matches_loser_next_team_check,
  drop constraint if exists playoff_matches_loss_counts_check;

alter table public.playoff_matches
  add constraint playoff_matches_elimination_section_check
    check (elimination_section is null or elimination_section in ('main', 'second_chance', 'last_chance', 'finals')),
  add constraint playoff_matches_loser_next_team_check
    check (loser_next_match_team is null or loser_next_match_team in ('A', 'B')),
  add constraint playoff_matches_loss_counts_check
    check (team_a_losses >= 0 and team_b_losses >= 0 and elimination_limit between 1 and 3);

create unique index if not exists playoff_matches_tournament_template_key_idx
  on public.playoff_matches (tournament_id, template_key)
  where template_key is not null;

comment on column public.tournaments.pool_postseason_format is
  'Qualification and elimination structure: standings split, single, first-round consolation, double, or triple elimination.';

comment on column public.tournaments.postseason_final_format is
  'Whether prior losses carry into multi-elimination finals or the final is one winner-take-all match.';

create or replace function public.correct_multi_elimination_match_score(
  p_match_id uuid,
  p_team_a_score integer,
  p_team_b_score integer,
  p_game_1_a integer default null,
  p_game_1_b integer default null,
  p_game_2_a integer default null,
  p_game_2_b integer default null,
  p_game_3_a integer default null,
  p_game_3_b integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.playoff_matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_winner_team text;
  v_winner_player_1_id uuid;
  v_winner_player_2_id uuid;
  v_winner_seed integer;
  v_winner_losses integer;
  v_loser_player_1_id uuid;
  v_loser_player_2_id uuid;
  v_loser_seed integer;
  v_loser_losses integer;
  v_winner_changed boolean;
  v_cycle_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to correct a postseason score.' using errcode = '42501';
  end if;

  select * into v_match from public.playoff_matches where id = p_match_id for update;
  if not found then raise exception 'Postseason match not found.'; end if;
  select * into v_tournament from public.tournaments where id = v_match.tournament_id for update;

  if v_tournament.organizer_user_id is distinct from auth.uid()
     and v_tournament.co_organizer_user_id is distinct from auth.uid()
     and not public.can_manage_tournament_prize_scope(v_tournament.id, auth.uid()) then
    raise exception 'Only an organizer can correct postseason scores.' using errcode = '42501';
  end if;
  if v_tournament.pool_postseason_format not in ('single_consolation', 'double', 'triple') then
    raise exception 'This correction routine is only for fixed-path elimination brackets.';
  end if;
  if not v_match.is_complete or v_match.is_bye then
    raise exception 'Only a completed postseason match can be corrected.';
  end if;
  if p_team_a_score is null or p_team_b_score is null or p_team_a_score < 0
     or p_team_b_score < 0 or p_team_a_score = p_team_b_score then
    raise exception 'Enter valid, non-tied postseason scores.';
  end if;

  v_winner_team := case when p_team_a_score > p_team_b_score then 'A' else 'B' end;
  v_winner_player_1_id := case when v_winner_team = 'A' then v_match.team_a_player_1_id else v_match.team_b_player_1_id end;
  v_winner_player_2_id := case when v_winner_team = 'A' then v_match.team_a_player_2_id else v_match.team_b_player_2_id end;
  v_winner_seed := case when v_winner_team = 'A' then v_match.team_a_seed else v_match.team_b_seed end;
  v_winner_losses := case when v_winner_team = 'A' then v_match.team_a_losses else v_match.team_b_losses end;
  v_loser_player_1_id := case when v_winner_team = 'A' then v_match.team_b_player_1_id else v_match.team_a_player_1_id end;
  v_loser_player_2_id := case when v_winner_team = 'A' then v_match.team_b_player_2_id else v_match.team_a_player_2_id end;
  v_loser_seed := case when v_winner_team = 'A' then v_match.team_b_seed else v_match.team_a_seed end;
  v_loser_losses := (case when v_winner_team = 'A' then v_match.team_b_losses else v_match.team_a_losses end) + 1;
  v_winner_changed := v_match.winner_team is distinct from v_winner_team;

  if v_winner_changed and v_tournament.moneyball_series_id is not null then
    select pc.id into v_cycle_id
    from public.tournament_prize_cycles pc
    join public.tournament_prize_wins pw on pw.cycle_id = pc.id
    where pw.tournament_id = v_tournament.id
    limit 1;
    if v_cycle_id is not null and exists (
      select 1 from public.tournament_prize_cycles pc where pc.id = v_cycle_id and pc.status = 'paid'
    ) then
      raise exception 'This Moneyball cycle has already been paid, so its bracket results cannot be changed.';
    end if;
  end if;

  update public.playoff_matches
  set team_a_score = p_team_a_score, team_b_score = p_team_b_score,
      game_1_a = case when v_match.match_format = 'best_of_3' then p_game_1_a else null end,
      game_1_b = case when v_match.match_format = 'best_of_3' then p_game_1_b else null end,
      game_2_a = case when v_match.match_format = 'best_of_3' then p_game_2_a else null end,
      game_2_b = case when v_match.match_format = 'best_of_3' then p_game_2_b else null end,
      game_3_a = case when v_match.match_format = 'best_of_3' then p_game_3_a else null end,
      game_3_b = case when v_match.match_format = 'best_of_3' then p_game_3_b else null end,
      winner_team = v_winner_team, winner_player_1_id = v_winner_player_1_id,
      winner_player_2_id = v_winner_player_2_id, is_complete = true
  where id = v_match.id;

  if not v_winner_changed then return; end if;

  create temporary table if not exists pg_temp.multi_elimination_affected (id uuid primary key) on commit drop;
  truncate pg_temp.multi_elimination_affected;
  insert into pg_temp.multi_elimination_affected (id)
  with recursive descendants(id) as (
    select v_match.next_match_id where v_match.next_match_id is not null
    union
    select v_match.loser_next_match_id where v_match.loser_next_match_id is not null
    union
    select edge.next_id
    from descendants d
    join public.playoff_matches pm on pm.id = d.id
    cross join lateral (values (pm.next_match_id), (pm.loser_next_match_id)) edge(next_id)
    where edge.next_id is not null
  ) select id from descendants;

  if v_match.elimination_section = 'finals' then
    delete from public.playoff_matches
    where tournament_id = v_match.tournament_id
      and elimination_section = 'finals' and round_number > v_match.round_number;
  else
    delete from public.playoff_matches
    where tournament_id = v_match.tournament_id and elimination_section = 'finals';
  end if;

  update public.playoff_matches target
  set team_a_seed = case when exists (
        select 1 from public.playoff_matches source
        where (source.id = v_match.id or source.id in (select id from pg_temp.multi_elimination_affected))
          and ((source.next_match_id = target.id and source.next_match_team = 'A')
            or (source.loser_next_match_id = target.id and source.loser_next_match_team = 'A'))
      ) then null else target.team_a_seed end,
      team_a_player_1_id = case when exists (
        select 1 from public.playoff_matches source
        where (source.id = v_match.id or source.id in (select id from pg_temp.multi_elimination_affected))
          and ((source.next_match_id = target.id and source.next_match_team = 'A')
            or (source.loser_next_match_id = target.id and source.loser_next_match_team = 'A'))
      ) then null else target.team_a_player_1_id end,
      team_a_player_2_id = case when exists (
        select 1 from public.playoff_matches source
        where (source.id = v_match.id or source.id in (select id from pg_temp.multi_elimination_affected))
          and ((source.next_match_id = target.id and source.next_match_team = 'A')
            or (source.loser_next_match_id = target.id and source.loser_next_match_team = 'A'))
      ) then null else target.team_a_player_2_id end,
      team_b_seed = case when exists (
        select 1 from public.playoff_matches source
        where (source.id = v_match.id or source.id in (select id from pg_temp.multi_elimination_affected))
          and ((source.next_match_id = target.id and source.next_match_team = 'B')
            or (source.loser_next_match_id = target.id and source.loser_next_match_team = 'B'))
      ) then null else target.team_b_seed end,
      team_b_player_1_id = case when exists (
        select 1 from public.playoff_matches source
        where (source.id = v_match.id or source.id in (select id from pg_temp.multi_elimination_affected))
          and ((source.next_match_id = target.id and source.next_match_team = 'B')
            or (source.loser_next_match_id = target.id and source.loser_next_match_team = 'B'))
      ) then null else target.team_b_player_1_id end,
      team_b_player_2_id = case when exists (
        select 1 from public.playoff_matches source
        where (source.id = v_match.id or source.id in (select id from pg_temp.multi_elimination_affected))
          and ((source.next_match_id = target.id and source.next_match_team = 'B')
            or (source.loser_next_match_id = target.id and source.loser_next_match_team = 'B'))
      ) then null else target.team_b_player_2_id end,
      team_a_score = null, team_b_score = null,
      game_1_a = null, game_1_b = null, game_2_a = null, game_2_b = null, game_3_a = null, game_3_b = null,
      winner_team = null, winner_player_1_id = null, winner_player_2_id = null, is_complete = false
  where target.id in (select id from pg_temp.multi_elimination_affected);

  if v_match.next_match_id is not null then
    update public.playoff_matches set
      team_a_seed = case when v_match.next_match_team = 'A' then v_winner_seed else team_a_seed end,
      team_a_player_1_id = case when v_match.next_match_team = 'A' then v_winner_player_1_id else team_a_player_1_id end,
      team_a_player_2_id = case when v_match.next_match_team = 'A' then v_winner_player_2_id else team_a_player_2_id end,
      team_a_losses = case when v_match.next_match_team = 'A' then v_winner_losses else team_a_losses end,
      team_b_seed = case when v_match.next_match_team = 'B' then v_winner_seed else team_b_seed end,
      team_b_player_1_id = case when v_match.next_match_team = 'B' then v_winner_player_1_id else team_b_player_1_id end,
      team_b_player_2_id = case when v_match.next_match_team = 'B' then v_winner_player_2_id else team_b_player_2_id end,
      team_b_losses = case when v_match.next_match_team = 'B' then v_winner_losses else team_b_losses end
    where id = v_match.next_match_id;
  end if;
  if v_match.loser_next_match_id is not null then
    update public.playoff_matches set
      team_a_seed = case when v_match.loser_next_match_team = 'A' then v_loser_seed else team_a_seed end,
      team_a_player_1_id = case when v_match.loser_next_match_team = 'A' then v_loser_player_1_id else team_a_player_1_id end,
      team_a_player_2_id = case when v_match.loser_next_match_team = 'A' then v_loser_player_2_id else team_a_player_2_id end,
      team_a_losses = case when v_match.loser_next_match_team = 'A' then v_loser_losses else team_a_losses end,
      team_b_seed = case when v_match.loser_next_match_team = 'B' then v_loser_seed else team_b_seed end,
      team_b_player_1_id = case when v_match.loser_next_match_team = 'B' then v_loser_player_1_id else team_b_player_1_id end,
      team_b_player_2_id = case when v_match.loser_next_match_team = 'B' then v_loser_player_2_id else team_b_player_2_id end,
      team_b_losses = case when v_match.loser_next_match_team = 'B' then v_loser_losses else team_b_losses end
    where id = v_match.loser_next_match_id;
  end if;

  update public.tournaments set status = 'started', playoff_status = 'in_progress',
    champion_player_1_id = null, champion_player_2_id = null
  where id = v_tournament.id;
  if v_tournament.moneyball_series_id is not null then
    delete from public.tournament_prize_wins where tournament_id = v_tournament.id;
    delete from public.tournament_daily_prize_winnings where tournament_id = v_tournament.id;
    if v_cycle_id is not null then
      update public.tournament_prize_cycles pc
      set status = case when exists (
            select 1 from public.tournament_prize_wins pw where pw.cycle_id = v_cycle_id
            group by pw.user_id having count(*) >= pc.target_wins
          ) then 'pending_payout' else 'active' end,
          threshold_reached_at = case when exists (
            select 1 from public.tournament_prize_wins pw where pw.cycle_id = v_cycle_id
            group by pw.user_id having count(*) >= pc.target_wins
          ) then pc.threshold_reached_at else null end
      where pc.id = v_cycle_id;
    end if;
  end if;
end;
$$;

revoke all on function public.correct_multi_elimination_match_score(uuid, integer, integer, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.correct_multi_elimination_match_score(uuid, integer, integer, integer, integer, integer, integer, integer, integer) to authenticated;
