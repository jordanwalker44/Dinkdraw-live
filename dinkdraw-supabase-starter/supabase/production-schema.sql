


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."admin_create_organization_with_access"("p_user_id" "uuid", "p_organization_name" "text") RETURNS TABLE("id" "uuid", "name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  created_organization public.organizations%rowtype;
begin
  if not public.is_dinkdraw_admin() then
    raise exception 'Not authorized';
  end if;

  if p_user_id is null or nullif(trim(p_organization_name), '') is null then
    raise exception 'User and organization name are required';
  end if;

  insert into public.organizations (
    name,
    created_by_user_id
  )
  values (
    trim(p_organization_name),
    p_user_id
  )
  returning * into created_organization;

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  )
  values (
    created_organization.id,
    p_user_id,
    'owner'
  );

  perform public.admin_ensure_feature_entitlement(
    p_user_id,
    null,
    'organization_mode',
    'Granted from admin page for ' || created_organization.name
  );

  perform public.admin_ensure_feature_entitlement(
    p_user_id,
    null,
    'cream_of_the_crop',
    'Granted from admin page for ' || created_organization.name
  );

  perform public.admin_ensure_feature_entitlement(
    null,
    created_organization.id,
    'cream_of_the_crop',
    'Granted from admin page'
  );

  return query
  select created_organization.id, created_organization.name;
end;
$$;


ALTER FUNCTION "public"."admin_create_organization_with_access"("p_user_id" "uuid", "p_organization_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_ensure_feature_entitlement"("p_user_id" "uuid", "p_organization_id" "uuid", "p_feature_key" "text", "p_notes" "text" DEFAULT 'Granted from admin page'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  existing_id uuid;
begin
  if not public.is_dinkdraw_admin() then
    raise exception 'Not authorized';
  end if;

  select id
  into existing_id
  from public.feature_entitlements
  where feature_key = p_feature_key
    and (
      (p_user_id is null and user_id is null)
      or user_id = p_user_id
    )
    and (
      (p_organization_id is null and organization_id is null)
      or organization_id = p_organization_id
    )
  limit 1;

  if existing_id is not null then
    update public.feature_entitlements
    set
      status = 'active',
      notes = p_notes
    where id = existing_id;
  else
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
      'active',
      p_notes
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."admin_ensure_feature_entitlement"("p_user_id" "uuid", "p_organization_id" "uuid", "p_feature_key" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_rename_organization"("p_organization_id" "uuid", "p_organization_name" "text") RETURNS TABLE("id" "uuid", "name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_dinkdraw_admin() then
    raise exception 'Not authorized';
  end if;

  if p_organization_id is null or nullif(trim(p_organization_name), '') is null then
    raise exception 'Organization and new name are required';
  end if;

  return query
  update public.organizations
  set name = trim(p_organization_name)
  where organizations.id = p_organization_id
  returning organizations.id, organizations.name;
end;
$$;


ALTER FUNCTION "public"."admin_rename_organization"("p_organization_id" "uuid", "p_organization_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_organization_brand"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "logo_url" "text", "primary_color" "text", "accent_color" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    organizations.id,
    organizations.name,
    organizations.logo_url,
    organizations.primary_color,
    organizations.accent_color
  from public.organizations
  where organizations.id = p_organization_id
  limit 1;
$$;


ALTER FUNCTION "public"."get_public_organization_brand"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_dinkdraw_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.app_admins
    where lower(app_admins.email) = lower(auth.jwt() ->> 'email')
  );
$$;


ALTER FUNCTION "public"."is_dinkdraw_admin"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "court_number" integer,
    "team_a_player_1_id" "uuid",
    "team_a_player_2_id" "uuid",
    "team_b_player_1_id" "uuid",
    "team_b_player_2_id" "uuid",
    "team_a_score" integer,
    "team_b_score" integer,
    "is_bye" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_complete" boolean DEFAULT false NOT NULL,
    "game_1_a" integer,
    "game_1_b" integer,
    "game_2_a" integer,
    "game_2_b" integer,
    "game_3_a" integer,
    "game_3_b" integer,
    "reported_by_user_id" "uuid",
    "reported_at" timestamp with time zone,
    "court_label" "text"
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team1_score" integer, "p_team2_score" integer) RETURNS "public"."matches"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_match public.matches;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_team1_score is null or p_team2_score is null then
    raise exception 'Both scores are required';
  end if;

  if p_team1_score < 0 or p_team2_score < 0 then
    raise exception 'Scores cannot be negative';
  end if;

  if p_team1_score > 99 or p_team2_score > 99 then
    raise exception 'Scores look invalid';
  end if;

  if not exists (
    select 1
    from public.matches m
    join public.tournaments t
      on t.id = m.tournament_id
    where m.id = p_match_id
      and t.allow_player_score_reporting = true
      and (
        t.organizer_user_id = auth.uid()
        or exists (
          select 1
          from public.tournament_players tp
          where tp.tournament_id = t.id
            and tp.claimed_by_user_id = auth.uid()
        )
      )
  ) then
    raise exception 'Not allowed to report score for this match';
  end if;

  update public.matches m
  set
    team1_score = p_team1_score,
    team2_score = p_team2_score,
    status = case
      when m.status is null or m.status = 'pending' then 'completed'
      else m.status
    end,
    reported_by_user_id = auth.uid(),
    reported_at = now(),
    updated_at = now()
  where m.id = p_match_id
  returning * into v_match;

  if v_match.id is null then
    raise exception 'Match not found';
  end if;

  return v_match;
end;
$$;


ALTER FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team1_score" integer, "p_team2_score" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team_a_score" integer DEFAULT NULL::integer, "p_team_b_score" integer DEFAULT NULL::integer, "p_game_1_a" integer DEFAULT NULL::integer, "p_game_1_b" integer DEFAULT NULL::integer, "p_game_2_a" integer DEFAULT NULL::integer, "p_game_2_b" integer DEFAULT NULL::integer, "p_game_3_a" integer DEFAULT NULL::integer, "p_game_3_b" integer DEFAULT NULL::integer, "p_mark_complete" boolean DEFAULT false) RETURNS "public"."matches"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_match public.matches;
  v_tournament public.tournaments;
  v_user_id uuid;

  v_team_a_score integer;
  v_team_b_score integer;

  v_game_1_a integer;
  v_game_1_b integer;
  v_game_2_a integer;
  v_game_2_b integer;
  v_game_3_a integer;
  v_game_3_b integer;

  v_a_wins integer := 0;
  v_b_wins integer := 0;
  v_is_player_in_match boolean := false;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_match
  from public.matches
  where id = p_match_id;

  if v_match.id is null then
    raise exception 'Match not found';
  end if;

  select *
  into v_tournament
  from public.tournaments
  where id = v_match.tournament_id;

  if v_tournament.id is null then
    raise exception 'Tournament not found';
  end if;

  select exists (
    select 1
    from public.tournament_players tp
    where tp.claimed_by_user_id = v_user_id
      and tp.id in (
        v_match.team_a_player_1_id,
        v_match.team_a_player_2_id,
        v_match.team_b_player_1_id,
        v_match.team_b_player_2_id
      )
  )
  into v_is_player_in_match;

  if not (
    v_tournament.organizer_user_id = v_user_id
    or (
      v_tournament.allow_player_score_reporting = true
      and v_is_player_in_match = true
    )
  ) then
    raise exception 'Not allowed to report score for this match';
  end if;

  if p_team_a_score is not null and p_team_a_score < 0 then
    raise exception 'team_a_score cannot be negative';
  end if;

  if p_team_b_score is not null and p_team_b_score < 0 then
    raise exception 'team_b_score cannot be negative';
  end if;

  if p_game_1_a is not null and p_game_1_a < 0 then
    raise exception 'game_1_a cannot be negative';
  end if;

  if p_game_1_b is not null and p_game_1_b < 0 then
    raise exception 'game_1_b cannot be negative';
  end if;

  if p_game_2_a is not null and p_game_2_a < 0 then
    raise exception 'game_2_a cannot be negative';
  end if;

  if p_game_2_b is not null and p_game_2_b < 0 then
    raise exception 'game_2_b cannot be negative';
  end if;

  if p_game_3_a is not null and p_game_3_a < 0 then
    raise exception 'game_3_a cannot be negative';
  end if;

  if p_game_3_b is not null and p_game_3_b < 0 then
    raise exception 'game_3_b cannot be negative';
  end if;

  v_team_a_score := coalesce(p_team_a_score, v_match.team_a_score);
  v_team_b_score := coalesce(p_team_b_score, v_match.team_b_score);

  v_game_1_a := coalesce(p_game_1_a, v_match.game_1_a);
  v_game_1_b := coalesce(p_game_1_b, v_match.game_1_b);
  v_game_2_a := coalesce(p_game_2_a, v_match.game_2_a);
  v_game_2_b := coalesce(p_game_2_b, v_match.game_2_b);
  v_game_3_a := coalesce(p_game_3_a, v_match.game_3_a);
  v_game_3_b := coalesce(p_game_3_b, v_match.game_3_b);

  if v_tournament.match_format = 'best_of_3' then
    if (v_game_1_a is null) <> (v_game_1_b is null) then
      raise exception 'Game 1 requires both scores';
    end if;

    if (v_game_2_a is null) <> (v_game_2_b is null) then
      raise exception 'Game 2 requires both scores';
    end if;

    if (v_game_3_a is null) <> (v_game_3_b is null) then
      raise exception 'Game 3 requires both scores';
    end if;

    if v_game_1_a is not null and v_game_1_b is not null then
      if v_game_1_a = v_game_1_b then
        raise exception 'Game 1 cannot end in a tie';
      end if;
      if v_game_1_a > v_game_1_b then
        v_a_wins := v_a_wins + 1;
      else
        v_b_wins := v_b_wins + 1;
      end if;
    end if;

    if v_game_2_a is not null and v_game_2_b is not null then
      if v_game_2_a = v_game_2_b then
        raise exception 'Game 2 cannot end in a tie';
      end if;
      if v_game_2_a > v_game_2_b then
        v_a_wins := v_a_wins + 1;
      else
        v_b_wins := v_b_wins + 1;
      end if;
    end if;

    if v_game_3_a is not null and v_game_3_b is not null then
      if v_game_3_a = v_game_3_b then
        raise exception 'Game 3 cannot end in a tie';
      end if;
      if v_game_3_a > v_game_3_b then
        v_a_wins := v_a_wins + 1;
      else
        v_b_wins := v_b_wins + 1;
      end if;
    end if;

    v_team_a_score :=
      coalesce(v_game_1_a, 0) +
      coalesce(v_game_2_a, 0) +
      coalesce(v_game_3_a, 0);

    v_team_b_score :=
      coalesce(v_game_1_b, 0) +
      coalesce(v_game_2_b, 0) +
      coalesce(v_game_3_b, 0);

    if p_mark_complete then
      if not (v_a_wins = 2 or v_b_wins = 2) then
        raise exception 'Best-of-3 match is not complete yet';
      end if;
    end if;

    update public.matches
    set
      team_a_score = v_team_a_score,
      team_b_score = v_team_b_score,
      game_1_a = v_game_1_a,
      game_1_b = v_game_1_b,
      game_2_a = v_game_2_a,
      game_2_b = v_game_2_b,
      game_3_a = v_game_3_a,
      game_3_b = v_game_3_b,
      is_complete = case
        when p_mark_complete then true
        else is_complete
      end,
      reported_by_user_id = v_user_id,
      reported_at = now()
    where id = p_match_id
    returning * into v_match;

  else
    if p_mark_complete then
      if v_team_a_score is null or v_team_b_score is null then
        raise exception 'Both scores are required';
      end if;

      if v_team_a_score = v_team_b_score then
        raise exception 'Match cannot end in a tie';
      end if;
    end if;

    update public.matches
    set
      team_a_score = v_team_a_score,
      team_b_score = v_team_b_score,
      reported_by_user_id = v_user_id,
      reported_at = now(),
      is_complete = case
        when p_mark_complete then true
        else is_complete
      end
    where id = p_match_id
    returning * into v_match;
  end if;

  return v_match;
end;
$$;


ALTER FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team_a_score" integer, "p_team_b_score" integer, "p_game_1_a" integer, "p_game_1_b" integer, "p_game_2_a" integer, "p_game_2_b" integer, "p_game_3_a" integer, "p_game_3_b" integer, "p_mark_complete" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_admins" (
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "placement" integer NOT NULL,
    "games" integer DEFAULT 0,
    "wins" integer DEFAULT 0,
    "losses" integer DEFAULT 0,
    "points_for" integer DEFAULT 0,
    "points_against" integer DEFAULT 0,
    "differential" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."event_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorite_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "location" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favorite_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_entitlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "feature_key" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feature_entitlements_check" CHECK ((("organization_id" IS NOT NULL) OR ("user_id" IS NOT NULL)))
);


ALTER TABLE "public"."feature_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lifetime_stats" (
    "user_id" "uuid" NOT NULL,
    "events" integer DEFAULT 0 NOT NULL,
    "games" integer DEFAULT 0 NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "losses" integer DEFAULT 0 NOT NULL,
    "points_for" integer DEFAULT 0 NOT NULL,
    "points_against" integer DEFAULT 0 NOT NULL,
    "differential" integer DEFAULT 0 NOT NULL,
    "firsts" integer DEFAULT 0 NOT NULL,
    "seconds" integer DEFAULT 0 NOT NULL,
    "thirds" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lifetime_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logo_url" "text",
    "primary_color" "text" DEFAULT '#00274C'::"text",
    "accent_color" "text" DEFAULT '#FFCB05'::"text"
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_match_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "match_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "played_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "partner_user_id" "uuid",
    "opponent_1_user_id" "uuid",
    "opponent_2_user_id" "uuid",
    "result" "text" NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "losses" integer DEFAULT 0 NOT NULL,
    "ties" integer DEFAULT 0 NOT NULL,
    "points_for" integer DEFAULT 0 NOT NULL,
    "points_against" integer DEFAULT 0 NOT NULL,
    "point_diff" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "format" "text" DEFAULT 'doubles'::"text" NOT NULL,
    "game_number" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "player_match_stats_result_check" CHECK (("result" = ANY (ARRAY['win'::"text", 'loss'::"text", 'tie'::"text"])))
);


ALTER TABLE "public"."player_match_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_match_stats_backup" (
    "id" "uuid",
    "user_id" "uuid",
    "tournament_id" "uuid",
    "match_id" "uuid",
    "round_number" integer,
    "played_at" timestamp with time zone,
    "partner_user_id" "uuid",
    "opponent_1_user_id" "uuid",
    "opponent_2_user_id" "uuid",
    "result" "text",
    "wins" integer,
    "losses" integer,
    "ties" integer,
    "points_for" integer,
    "points_against" integer,
    "point_diff" integer,
    "created_at" timestamp with time zone,
    "format" "text"
);


ALTER TABLE "public"."player_match_stats_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."playoff_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "match_number" integer NOT NULL,
    "round_label" "text",
    "team_a_seed" integer,
    "team_b_seed" integer,
    "team_a_player_1_id" "uuid",
    "team_a_player_2_id" "uuid",
    "team_b_player_1_id" "uuid",
    "team_b_player_2_id" "uuid",
    "team_a_score" integer,
    "team_b_score" integer,
    "winner_team" "text",
    "winner_player_1_id" "uuid",
    "winner_player_2_id" "uuid",
    "next_match_id" "uuid",
    "next_match_team" "text",
    "is_bye" boolean DEFAULT false NOT NULL,
    "is_complete" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."playoff_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_co_organizers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text",
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_co_organizers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "slot_number" integer NOT NULL,
    "display_name" "text",
    "claimed_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "gender" "text",
    "dupr_id" "text"
);


ALTER TABLE "public"."tournament_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "organizer_user_id" "uuid" NOT NULL,
    "organizer_name" "text",
    "join_code" "text" NOT NULL,
    "player_count" integer NOT NULL,
    "courts" integer NOT NULL,
    "rounds" integer NOT NULL,
    "games_to" integer NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "finalized_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "event_date" "date",
    "event_time" "text",
    "location" "text",
    "started_at" timestamp with time zone,
    "format" "text" DEFAULT 'doubles'::"text" NOT NULL,
    "match_format" "text" DEFAULT 'single'::"text" NOT NULL,
    "doubles_mode" "text" DEFAULT 'rotating'::"text",
    "gender" "text",
    "is_public" boolean DEFAULT true,
    "allow_player_score_reporting" boolean DEFAULT false NOT NULL,
    "court_labels" "text"[],
    "playoff_format" "text" DEFAULT 'none'::"text" NOT NULL,
    "playoff_advance_count" integer,
    "playoff_seeding_style" "text" DEFAULT 'traditional'::"text" NOT NULL,
    "playoff_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "champion_player_1_id" "uuid",
    "champion_player_2_id" "uuid",
    "tournament_mode" "text" DEFAULT 'round_robin'::"text",
    "co_organizer_email" "text",
    "ask_for_dupr_id" boolean DEFAULT false,
    "organization_id" "uuid",
    "allow_any_player_score_reporting" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."tournaments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tournaments"."allow_any_player_score_reporting" IS 'When true, claimed players may submit scores for any match in the tournament instead of only their own matches.';



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_admins"
    ADD CONSTRAINT "app_admins_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."event_results"
    ADD CONSTRAINT "event_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_results"
    ADD CONSTRAINT "event_results_tournament_id_user_id_key" UNIQUE ("tournament_id", "user_id");



ALTER TABLE ONLY "public"."favorite_locations"
    ADD CONSTRAINT "favorite_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_entitlements"
    ADD CONSTRAINT "feature_entitlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lifetime_stats"
    ADD CONSTRAINT "lifetime_stats_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."organizations"
    ADD CONSTRAINT "organizations_accent_color_hex" CHECK ((("accent_color" IS NULL) OR ("accent_color" ~ '^#[0-9A-Fa-f]{6}$'::"text"))) NOT VALID;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."organizations"
    ADD CONSTRAINT "organizations_primary_color_hex" CHECK ((("primary_color" IS NULL) OR ("primary_color" ~ '^#[0-9A-Fa-f]{6}$'::"text"))) NOT VALID;



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playoff_matches"
    ADD CONSTRAINT "playoff_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."saved_co_organizers"
    ADD CONSTRAINT "saved_co_organizers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_co_organizers"
    ADD CONSTRAINT "saved_co_organizers_user_id_email_key" UNIQUE ("user_id", "email");



ALTER TABLE ONLY "public"."tournament_players"
    ADD CONSTRAINT "tournament_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_players"
    ADD CONSTRAINT "tournament_players_tournament_id_slot_number_key" UNIQUE ("tournament_id", "slot_number");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_join_code_key" UNIQUE ("join_code");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_player_match_stats_played_at" ON "public"."player_match_stats" USING "btree" ("played_at" DESC);



CREATE INDEX "idx_player_match_stats_tournament_id" ON "public"."player_match_stats" USING "btree" ("tournament_id");



CREATE INDEX "idx_player_match_stats_user_id" ON "public"."player_match_stats" USING "btree" ("user_id");



CREATE UNIQUE INDEX "player_match_stats_match_id_user_id_game_number_key" ON "public"."player_match_stats" USING "btree" ("match_id", "user_id", "game_number");



CREATE INDEX "tournaments_organization_id_idx" ON "public"."tournaments" USING "btree" ("organization_id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_results"
    ADD CONSTRAINT "event_results_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_results"
    ADD CONSTRAINT "event_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."favorite_locations"
    ADD CONSTRAINT "favorite_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_entitlements"
    ADD CONSTRAINT "feature_entitlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_entitlements"
    ADD CONSTRAINT "feature_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lifetime_stats"
    ADD CONSTRAINT "lifetime_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team_a_player_1_id_fkey" FOREIGN KEY ("team_a_player_1_id") REFERENCES "public"."tournament_players"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team_a_player_2_id_fkey" FOREIGN KEY ("team_a_player_2_id") REFERENCES "public"."tournament_players"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team_b_player_1_id_fkey" FOREIGN KEY ("team_b_player_1_id") REFERENCES "public"."tournament_players"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team_b_player_2_id_fkey" FOREIGN KEY ("team_b_player_2_id") REFERENCES "public"."tournament_players"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_opponent_1_user_id_fkey" FOREIGN KEY ("opponent_1_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_opponent_2_user_id_fkey" FOREIGN KEY ("opponent_2_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_partner_user_id_fkey" FOREIGN KEY ("partner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playoff_matches"
    ADD CONSTRAINT "playoff_matches_team_a_player_1_id_fkey" FOREIGN KEY ("team_a_player_1_id") REFERENCES "public"."tournament_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playoff_matches"
    ADD CONSTRAINT "playoff_matches_team_a_player_2_id_fkey" FOREIGN KEY ("team_a_player_2_id") REFERENCES "public"."tournament_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playoff_matches"
    ADD CONSTRAINT "playoff_matches_team_b_player_1_id_fkey" FOREIGN KEY ("team_b_player_1_id") REFERENCES "public"."tournament_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playoff_matches"
    ADD CONSTRAINT "playoff_matches_team_b_player_2_id_fkey" FOREIGN KEY ("team_b_player_2_id") REFERENCES "public"."tournament_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playoff_matches"
    ADD CONSTRAINT "playoff_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playoff_matches"
    ADD CONSTRAINT "playoff_matches_winner_player_1_id_fkey" FOREIGN KEY ("winner_player_1_id") REFERENCES "public"."tournament_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playoff_matches"
    ADD CONSTRAINT "playoff_matches_winner_player_2_id_fkey" FOREIGN KEY ("winner_player_2_id") REFERENCES "public"."tournament_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_co_organizers"
    ADD CONSTRAINT "saved_co_organizers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_players"
    ADD CONSTRAINT "tournament_players_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tournament_players"
    ADD CONSTRAINT "tournament_players_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Admins can manage feature entitlements" ON "public"."feature_entitlements" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can manage organization members" ON "public"."organization_members" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can manage organizations" ON "public"."organizations" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can view themselves" ON "public"."admin_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Anyone can read playoff matches" ON "public"."playoff_matches" FOR SELECT USING (true);



CREATE POLICY "App admins can view themselves" ON "public"."app_admins" FOR SELECT USING (("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))));



CREATE POLICY "Authenticated users can insert organizations" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Claim player slot" ON "public"."tournament_players" FOR UPDATE TO "authenticated" USING (("claimed_by_user_id" IS NULL)) WITH CHECK (("claimed_by_user_id" = "auth"."uid"()));



CREATE POLICY "Claimed players can submit any match scores when enabled" ON "public"."matches" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."tournaments"
     JOIN "public"."tournament_players" ON (("tournament_players"."tournament_id" = "tournaments"."id")))
  WHERE (("tournaments"."id" = "matches"."tournament_id") AND ("tournaments"."status" = 'started'::"text") AND ("tournaments"."allow_player_score_reporting" IS TRUE) AND ("tournaments"."allow_any_player_score_reporting" IS TRUE) AND ("tournament_players"."claimed_by_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."tournaments"
     JOIN "public"."tournament_players" ON (("tournament_players"."tournament_id" = "tournaments"."id")))
  WHERE (("tournaments"."id" = "matches"."tournament_id") AND ("tournaments"."status" = 'started'::"text") AND ("tournaments"."allow_player_score_reporting" IS TRUE) AND ("tournaments"."allow_any_player_score_reporting" IS TRUE) AND ("tournament_players"."claimed_by_user_id" = "auth"."uid"())))));



CREATE POLICY "Co-organizers can manage matches" ON "public"."matches" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments"
  WHERE (("tournaments"."id" = "matches"."tournament_id") AND ("lower"(TRIM(BOTH FROM "tournaments"."co_organizer_email")) = "lower"(TRIM(BOTH FROM ("auth"."jwt"() ->> 'email'::"text")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments"
  WHERE (("tournaments"."id" = "matches"."tournament_id") AND ("lower"(TRIM(BOTH FROM "tournaments"."co_organizer_email")) = "lower"(TRIM(BOTH FROM ("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "Co-organizers can update tournaments" ON "public"."tournaments" FOR UPDATE TO "authenticated" USING (("lower"(TRIM(BOTH FROM "co_organizer_email")) = "lower"(TRIM(BOTH FROM ("auth"."jwt"() ->> 'email'::"text"))))) WITH CHECK (("lower"(TRIM(BOTH FROM "co_organizer_email")) = "lower"(TRIM(BOTH FROM ("auth"."jwt"() ->> 'email'::"text")))));



CREATE POLICY "Delete tournaments" ON "public"."tournaments" FOR DELETE TO "authenticated" USING (("organizer_user_id" = "auth"."uid"()));



CREATE POLICY "Insert match stats" ON "public"."player_match_stats" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."matches" "m"
     JOIN "public"."tournaments" "t" ON (("t"."id" = "m"."tournament_id")))
  WHERE (("m"."id" = "player_match_stats"."match_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Insert own results" ON "public"."event_results" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Insert own stats" ON "public"."lifetime_stats" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Insert tournaments" ON "public"."tournaments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "organizer_user_id"));



CREATE POLICY "Organization creators can add members" ON "public"."organization_members" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_members"."organization_id") AND ("organizations"."created_by_user_id" = "auth"."uid"())))));



CREATE POLICY "Organization creators can delete members" ON "public"."organization_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_members"."organization_id") AND ("organizations"."created_by_user_id" = "auth"."uid"())))));



CREATE POLICY "Organization creators can update members" ON "public"."organization_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_members"."organization_id") AND ("organizations"."created_by_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_members"."organization_id") AND ("organizations"."created_by_user_id" = "auth"."uid"())))));



CREATE POLICY "Organization owners can update branding" ON "public"."organizations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organizations"."id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organizations"."id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Organization owners can update organizations" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organizations"."id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'owner'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organizations"."id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'owner'::"text")))));



CREATE POLICY "Organizer can delete playoff matches" ON "public"."playoff_matches" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "playoff_matches"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Organizer can insert playoff matches" ON "public"."playoff_matches" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "playoff_matches"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Organizer can update playoff matches" ON "public"."playoff_matches" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "playoff_matches"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "playoff_matches"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Organizer delete player slots" ON "public"."tournament_players" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_players"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Organizer insert player slots" ON "public"."tournament_players" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_players"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Organizer update player slots" ON "public"."tournament_players" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_players"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_players"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Organizers can manage tournament players" ON "public"."tournament_players" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments"
  WHERE (("tournaments"."id" = "tournament_players"."tournament_id") AND (("tournaments"."organizer_user_id" = "auth"."uid"()) OR (("tournaments"."co_organizer_email" IS NOT NULL) AND ("lower"("tournaments"."co_organizer_email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments"
  WHERE (("tournaments"."id" = "tournament_players"."tournament_id") AND (("tournaments"."organizer_user_id" = "auth"."uid"()) OR (("tournaments"."co_organizer_email" IS NOT NULL) AND ("lower"("tournaments"."co_organizer_email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))))));



CREATE POLICY "Read match stats" ON "public"."player_match_stats" FOR SELECT USING (true);



CREATE POLICY "Read own results" ON "public"."event_results" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Read own stats" ON "public"."lifetime_stats" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Read player slots" ON "public"."tournament_players" FOR SELECT USING (true);



CREATE POLICY "Read profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Read tournaments" ON "public"."tournaments" FOR SELECT USING (true);



CREATE POLICY "Update match stats" ON "public"."player_match_stats" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."matches" "m"
     JOIN "public"."tournaments" "t" ON (("t"."id" = "m"."tournament_id")))
  WHERE (("m"."id" = "player_match_stats"."match_id") AND ("t"."organizer_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."matches" "m"
     JOIN "public"."tournaments" "t" ON (("t"."id" = "m"."tournament_id")))
  WHERE (("m"."id" = "player_match_stats"."match_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Update own stats" ON "public"."lifetime_stats" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Update tournaments" ON "public"."tournaments" FOR UPDATE TO "authenticated" USING (("organizer_user_id" = "auth"."uid"())) WITH CHECK (("organizer_user_id" = "auth"."uid"()));



CREATE POLICY "Users can create their own favorite locations" ON "public"."favorite_locations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own owner membership" ON "public"."organization_members" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("role" = 'owner'::"text")));



CREATE POLICY "Users can delete their own favorite locations" ON "public"."favorite_locations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own push tokens" ON "public"."push_tokens" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their saved co organizers" ON "public"."saved_co_organizers" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own push tokens" ON "public"."push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their saved co organizers" ON "public"."saved_co_organizers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their saved co organizers" ON "public"."saved_co_organizers" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own favorite locations" ON "public"."favorite_locations" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own push tokens" ON "public"."push_tokens" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their saved co organizers" ON "public"."saved_co_organizers" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view organization feature entitlements" ON "public"."feature_entitlements" FOR SELECT TO "authenticated" USING ((("organization_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "feature_entitlements"."organization_id") AND ("organization_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view organizations they belong to" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organizations"."id") AND ("organization_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view organizations they created" ON "public"."organizations" FOR SELECT TO "authenticated" USING (("created_by_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their organization memberships" ON "public"."organization_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own favorite locations" ON "public"."favorite_locations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own feature entitlements" ON "public"."feature_entitlements" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own push tokens" ON "public"."push_tokens" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorite_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_entitlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lifetime_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matches_delete_for_tournament_owner" ON "public"."matches" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "matches"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "matches_insert_for_tournament_owner" ON "public"."matches" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "matches"."tournament_id") AND ("t"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "matches_select_for_visible_tournaments" ON "public"."matches" FOR SELECT USING (true);



CREATE POLICY "matches_update_for_owner_or_players_in_match" ON "public"."matches" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "matches"."tournament_id") AND (("t"."organizer_user_id" = "auth"."uid"()) OR (("t"."allow_player_score_reporting" = true) AND (EXISTS ( SELECT 1
           FROM "public"."tournament_players" "p"
          WHERE (("p"."tournament_id" = "matches"."tournament_id") AND ("p"."claimed_by_user_id" = "auth"."uid"()) AND ("p"."id" = ANY (ARRAY["matches"."team_a_player_1_id", "matches"."team_a_player_2_id", "matches"."team_b_player_1_id", "matches"."team_b_player_2_id"]))))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "matches"."tournament_id") AND (("t"."organizer_user_id" = "auth"."uid"()) OR (("t"."allow_player_score_reporting" = true) AND (EXISTS ( SELECT 1
           FROM "public"."tournament_players" "p"
          WHERE (("p"."tournament_id" = "matches"."tournament_id") AND ("p"."claimed_by_user_id" = "auth"."uid"()) AND ("p"."id" = ANY (ARRAY["matches"."team_a_player_1_id", "matches"."team_a_player_2_id", "matches"."team_b_player_1_id", "matches"."team_b_player_2_id"])))))))))));



ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_match_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_match_stats_backup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."playoff_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_co_organizers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournaments" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."matches";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."playoff_matches";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tournament_players";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tournaments";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."admin_create_organization_with_access"("p_user_id" "uuid", "p_organization_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_create_organization_with_access"("p_user_id" "uuid", "p_organization_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_organization_with_access"("p_user_id" "uuid", "p_organization_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_ensure_feature_entitlement"("p_user_id" "uuid", "p_organization_id" "uuid", "p_feature_key" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_ensure_feature_entitlement"("p_user_id" "uuid", "p_organization_id" "uuid", "p_feature_key" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_ensure_feature_entitlement"("p_user_id" "uuid", "p_organization_id" "uuid", "p_feature_key" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_rename_organization"("p_organization_id" "uuid", "p_organization_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_rename_organization"("p_organization_id" "uuid", "p_organization_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_rename_organization"("p_organization_id" "uuid", "p_organization_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_organization_brand"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_organization_brand"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_organization_brand"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_dinkdraw_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_dinkdraw_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_dinkdraw_admin"() TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team1_score" integer, "p_team2_score" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team1_score" integer, "p_team2_score" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team1_score" integer, "p_team2_score" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team1_score" integer, "p_team2_score" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team_a_score" integer, "p_team_b_score" integer, "p_game_1_a" integer, "p_game_1_b" integer, "p_game_2_a" integer, "p_game_2_b" integer, "p_game_3_a" integer, "p_game_3_b" integer, "p_mark_complete" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team_a_score" integer, "p_team_b_score" integer, "p_game_1_a" integer, "p_game_1_b" integer, "p_game_2_a" integer, "p_game_2_b" integer, "p_game_3_a" integer, "p_game_3_b" integer, "p_mark_complete" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team_a_score" integer, "p_team_b_score" integer, "p_game_1_a" integer, "p_game_1_b" integer, "p_game_2_a" integer, "p_game_2_b" integer, "p_game_3_a" integer, "p_game_3_b" integer, "p_mark_complete" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_match_score"("p_match_id" "uuid", "p_team_a_score" integer, "p_team_b_score" integer, "p_game_1_a" integer, "p_game_1_b" integer, "p_game_2_a" integer, "p_game_2_b" integer, "p_game_3_a" integer, "p_game_3_b" integer, "p_mark_complete" boolean) TO "service_role";


















GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."app_admins" TO "anon";
GRANT ALL ON TABLE "public"."app_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."app_admins" TO "service_role";



GRANT ALL ON TABLE "public"."event_results" TO "anon";
GRANT ALL ON TABLE "public"."event_results" TO "authenticated";
GRANT ALL ON TABLE "public"."event_results" TO "service_role";



GRANT ALL ON TABLE "public"."favorite_locations" TO "anon";
GRANT ALL ON TABLE "public"."favorite_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."favorite_locations" TO "service_role";



GRANT ALL ON TABLE "public"."feature_entitlements" TO "anon";
GRANT ALL ON TABLE "public"."feature_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."lifetime_stats" TO "anon";
GRANT ALL ON TABLE "public"."lifetime_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."lifetime_stats" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."player_match_stats" TO "anon";
GRANT ALL ON TABLE "public"."player_match_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."player_match_stats" TO "service_role";



GRANT ALL ON TABLE "public"."player_match_stats_backup" TO "anon";
GRANT ALL ON TABLE "public"."player_match_stats_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."player_match_stats_backup" TO "service_role";



GRANT ALL ON TABLE "public"."playoff_matches" TO "anon";
GRANT ALL ON TABLE "public"."playoff_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."playoff_matches" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."saved_co_organizers" TO "anon";
GRANT ALL ON TABLE "public"."saved_co_organizers" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_co_organizers" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_players" TO "anon";
GRANT ALL ON TABLE "public"."tournament_players" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_players" TO "service_role";



GRANT ALL ON TABLE "public"."tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournaments" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































