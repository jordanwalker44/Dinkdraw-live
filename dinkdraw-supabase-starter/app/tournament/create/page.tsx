'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';
import { LocationAutocomplete } from '../../../components/LocationAutocomplete';

function makeJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const CREATE_TOURNAMENT_DRAFT_KEY = 'dinkdraw-create-tournament-draft';

type FavoriteLocation = {
  id: string;
  name: string;
  location: string;
};

type Organization = {
  id: string;
  name: string;
};

type MoneyballSeries = {
  id: string;
  name: string;
  organization_id: string;
  format: 'singles' | 'doubles';
  doubles_mode: 'rotating' | 'fixed' | 'mixed' | null;
  division: 'mixed' | 'mens' | 'womens' | 'open';
  target_wins: number;
  default_buy_in_cents: number;
  is_test: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function recommendedCourtCount(playerCount: number, format: 'singles' | 'doubles') {
  return Math.max(1, Math.floor(playerCount / (format === 'singles' ? 2 : 4)));
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div
  style={{
    display: 'grid',
    gridTemplateColumns: '64px 1fr 64px',
    gap: 8,
    alignItems: 'center',
  }}
>
        <button
  type="button"
  className="button secondary"
  onClick={(e) => {
  e.currentTarget.style.transform = 'scale(0.94)';
  setTimeout(() => {
    e.currentTarget.style.transform = 'scale(1)';
  }, 80);
  onChange(clamp(value - 1, min, max));
}}
  disabled={value <= min}
  style={{
    height: 64,
    fontSize: 28,
    borderRadius: 18,
    borderColor: 'rgba(255,203,5,0.28)',
    transition: 'transform 0.08s ease',
  }}
>
  −
</button>
        <div
  style={{
    height: 56,
    borderRadius: 16,
    background: '#001428',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 800,
  }}
>
  {value}
</div>
        <button
  type="button"
  className="button secondary"
  onClick={(e) => {
  e.currentTarget.style.transform = 'scale(0.94)';
  setTimeout(() => {
    e.currentTarget.style.transform = 'scale(1)';
  }, 80);
  onChange(clamp(value + 1, min, max));
}}
  disabled={value >= max}
  style={{
    height: 64,
    fontSize: 28,
    borderRadius: 18,
    borderColor: 'rgba(255,203,5,0.28)',
    transition: 'transform 0.08s ease',
  }}
>
  +
</button>
      </div>
    </div>
  );
}

export default function CreateTournamentPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [format, setFormat] = useState<'singles' | 'doubles'>('doubles');
  const [tournamentMode, setTournamentMode] = useState<'round_robin' | 'cream_of_the_crop'>('round_robin');
  const [matchFormat, setMatchFormat] = useState<'single' | 'best_of_3'>('single');
  const [standingsRankingMethod, setStandingsRankingMethod] = useState<'record_first' | 'point_diff_first'>('record_first');
  const [doublesMode, setDoublesMode] = useState<'rotating' | 'fixed' | 'mixed'>('rotating');
  const [title, setTitle] = useState('Saturday Round Robin');
  const [organizerName, setOrganizerName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [favoriteLocations, setFavoriteLocations] = useState<FavoriteLocation[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [moneyballSeries, setMoneyballSeries] = useState<MoneyballSeries[]>([]);
  const [moneyballEnabled, setMoneyballEnabled] = useState(false);
  const [moneyballSeriesChoice, setMoneyballSeriesChoice] = useState<'existing' | 'new'>('existing');
  const [selectedMoneyballSeriesId, setSelectedMoneyballSeriesId] = useState('');
  const [newMoneyballSeriesName, setNewMoneyballSeriesName] = useState('');
  const [moneyballBuyInDollars, setMoneyballBuyInDollars] = useState(10);
  const [moneyballDivision, setMoneyballDivision] = useState<'mixed' | 'mens' | 'womens' | 'open'>('open');
  const [canUseOrganizations, setCanUseOrganizations] = useState(false);
  const [canUseCreamOfTheCrop, setCanUseCreamOfTheCrop] = useState(false);
  const [canUsePoolBracketsAsUser, setCanUsePoolBracketsAsUser] = useState(false);
  const [leagueEnabledOrganizationIds, setLeagueEnabledOrganizationIds] = useState<string[]>([]);
  const [poolBracketEnabledOrganizationIds, setPoolBracketEnabledOrganizationIds] = useState<string[]>([]);
  const [selectedFavoriteLocationId, setSelectedFavoriteLocationId] = useState('');
  const [saveLocationForLater, setSaveLocationForLater] = useState(false);
  const [favoriteLocationName, setFavoriteLocationName] = useState('');
  const [allowPlayerScoreReporting, setAllowPlayerScoreReporting] = useState(false);
  const [allowAnyPlayerScoreReporting, setAllowAnyPlayerScoreReporting] = useState(false);
  const [askForDuprId, setAskForDuprId] = useState(false);
  const [playoffFormat, setPlayoffFormat] = useState<'none' | 'everyone' | 'top_4' | 'top_8' | 'top_16'>('none');
  const [playoffAdvanceCount, setPlayoffAdvanceCount] = useState(8);
  const [playoffSeedingStyle, setPlayoffSeedingStyle] = useState<'traditional' | 'simple'>('traditional');
  const [poolBracketsEnabled, setPoolBracketsEnabled] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [poolCount, setPoolCount] = useState(2);
  const [poolQualifiersPerGender, setPoolQualifiersPerGender] = useState(2);
  const [bracketMatchFormat, setBracketMatchFormat] = useState<'single' | 'best_of_3'>('single');
  const [bracketGamesTo, setBracketGamesTo] = useState(11);
  const [bracketDecidingGameTo, setBracketDecidingGameTo] = useState(11);
  
  const [playerCount, setPlayerCount] = useState(8);
  const [courts, setCourts] = useState(2);
  const [courtLabels, setCourtLabels] = useState<string[]>([]);
  const [rounds, setRounds] = useState(7);
  const [roundsManuallySet, setRoundsManuallySet] = useState(false);
  const [gamesTo, setGamesTo] = useState(11);

  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [invalidField, setInvalidField] = useState<'title' | 'location' | null>(null);
  const [isCreating, setIsCreating] = useState(false);

    function saveCreateTournamentDraft() {
    window.localStorage.setItem(
      CREATE_TOURNAMENT_DRAFT_KEY,
      JSON.stringify({
        format,
        tournamentMode,
        matchFormat,
        standingsRankingMethod,
        doublesMode,
        title,
        organizerName,
        eventDate,
        eventTime,
        location,
        saveLocationForLater,
        favoriteLocationName,
        allowPlayerScoreReporting,
        allowAnyPlayerScoreReporting,
        playoffFormat,
        playoffAdvanceCount,
        playoffSeedingStyle,
        poolBracketsEnabled,
        poolCount,
        poolQualifiersPerGender,
        bracketMatchFormat,
        bracketGamesTo,
        bracketDecidingGameTo,
        playerCount,
        courts,
        courtLabels,
        rounds,
        roundsManuallySet,
        gamesTo,
      })
    );
  }

  const minPlayers = format === 'singles' ? 3 : 4;
  const playersPerCourt = format === 'singles' ? 2 : 4;
  const maxCourtsAllowed = Math.max(1, Math.floor(playerCount / playersPerCourt));
  const isValidSetup = playerCount >= minPlayers;
  const playoffsAllowed =
  tournamentMode === 'round_robin' &&
  (format === 'singles' || (format === 'doubles' && doublesMode === 'fixed'));

    useEffect(() => {
    const rawDraft = window.localStorage.getItem(CREATE_TOURNAMENT_DRAFT_KEY);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft);

      if (draft.format) setFormat(draft.format);
      if (draft.tournamentMode) setTournamentMode(draft.tournamentMode);
      if (draft.matchFormat) setMatchFormat(draft.matchFormat);
      if (draft.standingsRankingMethod === 'record_first' || draft.standingsRankingMethod === 'point_diff_first') {
        setStandingsRankingMethod(draft.standingsRankingMethod);
      }
      if (draft.doublesMode) setDoublesMode(draft.doublesMode);
      if (typeof draft.title === 'string') setTitle(draft.title);
      if (typeof draft.organizerName === 'string') setOrganizerName(draft.organizerName);
      if (typeof draft.eventDate === 'string') setEventDate(draft.eventDate);
      if (typeof draft.eventTime === 'string') setEventTime(draft.eventTime);
      if (typeof draft.location === 'string') setLocation(draft.location);
      if (typeof draft.saveLocationForLater === 'boolean') {
        setSaveLocationForLater(draft.saveLocationForLater);
      }
      if (typeof draft.favoriteLocationName === 'string') {
        setFavoriteLocationName(draft.favoriteLocationName);
      }
      if (typeof draft.allowPlayerScoreReporting === 'boolean') {
        setAllowPlayerScoreReporting(draft.allowPlayerScoreReporting);
      }
      if (typeof draft.allowAnyPlayerScoreReporting === 'boolean') {
        setAllowAnyPlayerScoreReporting(draft.allowAnyPlayerScoreReporting);
        if (draft.allowAnyPlayerScoreReporting) setAllowPlayerScoreReporting(true);
      }
      if (draft.playoffFormat) setPlayoffFormat(draft.playoffFormat);
      if (typeof draft.playoffAdvanceCount === 'number') {
        setPlayoffAdvanceCount(draft.playoffAdvanceCount);
      }
      if (draft.playoffSeedingStyle) {
        setPlayoffSeedingStyle(draft.playoffSeedingStyle);
      }
      if (typeof draft.poolBracketsEnabled === 'boolean') setPoolBracketsEnabled(draft.poolBracketsEnabled);
      if (typeof draft.poolCount === 'number') setPoolCount(draft.poolCount);
      if (typeof draft.poolQualifiersPerGender === 'number') setPoolQualifiersPerGender(draft.poolQualifiersPerGender);
      if (draft.bracketMatchFormat) setBracketMatchFormat(draft.bracketMatchFormat);
      if (typeof draft.bracketGamesTo === 'number') setBracketGamesTo(draft.bracketGamesTo);
      if (typeof draft.bracketDecidingGameTo === 'number') setBracketDecidingGameTo(draft.bracketDecidingGameTo);
      if (typeof draft.playerCount === 'number') setPlayerCount(draft.playerCount);
      if (typeof draft.courts === 'number') setCourts(draft.courts);
      if (Array.isArray(draft.courtLabels)) setCourtLabels(draft.courtLabels);
      if (typeof draft.rounds === 'number') {
        setRounds(draft.rounds);
        setRoundsManuallySet(
          typeof draft.roundsManuallySet === 'boolean' ? draft.roundsManuallySet : true
        );
      }
      if (typeof draft.gamesTo === 'number') setGamesTo(draft.gamesTo);

      setMessage('Your tournament setup was restored. Sign in is complete, so you can create it now.');
    } catch {
      window.localStorage.removeItem(CREATE_TOURNAMENT_DRAFT_KEY);
    }
  }, []);
  
 useEffect(() => {
  async function loadUser() {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    const safeName = profile?.display_name || user.email?.split('@')[0] || 'Organizer';
    setOrganizerName(safeName);

    const { data: savedLocations } = await supabase
      .from('favorite_locations')
      .select('id, name, location')
      .order('name', { ascending: true });

    setFavoriteLocations(savedLocations || []);

    const { data: entitlements } = await supabase
      .from('feature_entitlements')
      .select('feature_key, status')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const entitlementKeys =
      entitlements?.map((item) => item.feature_key) || [];

    const organizationEnabled =
      entitlementKeys.includes('organization_mode');

    const creamEnabled =
      entitlementKeys.includes('cream_of_the_crop');

    setCanUseOrganizations(organizationEnabled);
    setCanUseCreamOfTheCrop(creamEnabled);
    setCanUsePoolBracketsAsUser(entitlementKeys.includes('round_robin_pool_brackets'));

    if (!organizationEnabled) {
      return;
  }

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role, organizations(id, name)')
      .eq('user_id', user.id);

    const loadedOrganizations =
      memberships
        ?.map((membership: any) => membership.organizations)
        .filter(Boolean) || [];

    if (loadedOrganizations.length > 0) {
      const organizerOrganizationIds = (memberships || [])
        .filter((membership: any) => ['owner', 'admin'].includes(membership.role))
        .map((membership: any) => membership.organization_id);
      const { data: organizationEntitlements } = organizerOrganizationIds.length
        ? await supabase
            .from('feature_entitlements')
            .select('organization_id, feature_key')
            .in('organization_id', organizerOrganizationIds)
            .in('feature_key', ['league_mode', 'round_robin_pool_brackets'])
            .eq('status', 'active')
        : { data: [] as { organization_id: string; feature_key: string }[] };

      setOrganizations(loadedOrganizations);
      setSelectedOrganizationId(loadedOrganizations[0].id);
      setLeagueEnabledOrganizationIds((organizationEntitlements || []).filter((item) => item.feature_key === 'league_mode').map((item) => item.organization_id));
      setPoolBracketEnabledOrganizationIds((organizationEntitlements || []).filter((item) => item.feature_key === 'round_robin_pool_brackets').map((item) => item.organization_id));
      return;
    }

    setMessage(
      'Organization access is enabled, but no organization has been assigned to your account. Contact DinkDraw for access.'
    );
  }

  loadUser();
}, [supabase]);

  const canUsePremiumLeagues =
    Boolean(selectedOrganizationId)
    && leagueEnabledOrganizationIds.includes(selectedOrganizationId);
  const canUsePoolBrackets = canUsePoolBracketsAsUser || (
    Boolean(selectedOrganizationId) && poolBracketEnabledOrganizationIds.includes(selectedOrganizationId)
  );
  const poolBracketsAvailable = tournamentMode === 'round_robin' && format === 'doubles' && ['rotating', 'mixed'].includes(doublesMode);
  const compatibleMoneyballSeries = useMemo(
    () => moneyballSeries.filter(
      (series) => series.format === format && series.doubles_mode === doublesMode && series.is_test === testMode
    ),
    [moneyballSeries, format, doublesMode, testMode]
  );

  useEffect(() => {
    if (!selectedOrganizationId) {
      setMoneyballSeries([]);
      setSelectedMoneyballSeriesId('');
      return;
    }

    let isActive = true;
    supabase
      .from('moneyball_series')
      .select('id, name, organization_id, format, doubles_mode, division, target_wins, default_buy_in_cents, is_test')
      .eq('organization_id', selectedOrganizationId)
      .eq('status', 'active')
      .order('name')
      .then(({ data, error }) => {
        if (!isActive) return;
        if (error) {
          setMoneyballSeries([]);
          return;
        }
        setMoneyballSeries((data || []) as MoneyballSeries[]);
      });

    return () => {
      isActive = false;
    };
  }, [selectedOrganizationId, supabase]);

  useEffect(() => {
    if (!moneyballEnabled) return;
    if (!compatibleMoneyballSeries.some((series) => series.id === selectedMoneyballSeriesId)) {
      setSelectedMoneyballSeriesId(compatibleMoneyballSeries[0]?.id || '');
      if (!compatibleMoneyballSeries.length) setMoneyballSeriesChoice('new');
    }
  }, [moneyballEnabled, compatibleMoneyballSeries, selectedMoneyballSeriesId]);

  useEffect(() => {
    if (!moneyballEnabled || moneyballSeriesChoice !== 'existing') return;
    const selectedSeries = compatibleMoneyballSeries.find(
      (series) => series.id === selectedMoneyballSeriesId
    );
    if (selectedSeries) {
      setMoneyballBuyInDollars(selectedSeries.default_buy_in_cents / 100);
    }
  }, [moneyballEnabled, moneyballSeriesChoice, compatibleMoneyballSeries, selectedMoneyballSeriesId]);

  useEffect(() => {
    if (doublesMode === 'mixed') {
      setMoneyballDivision('mixed');
    } else if (moneyballDivision === 'mixed') {
      setMoneyballDivision('open');
    }
  }, [doublesMode, moneyballDivision]);

  useEffect(() => {
    if (courts > maxCourtsAllowed) {
      setCourts(maxCourtsAllowed);
    }
  }, [playerCount, format, courts, maxCourtsAllowed]);
    useEffect(() => {
    setCourtLabels((prev) =>
      Array.from({ length: courts }, (_, i) => prev[i] ?? `Court ${i + 1}`)
    );
  }, [courts]);

    useEffect(() => {
  if (tournamentMode === 'cream_of_the_crop') {
    setFormat('doubles');
    setMatchFormat('single');
    setDoublesMode('rotating');
    setRounds(9);
    setGamesTo(11);

    if (playerCount % 4 !== 0) {
      setPlayerCount(Math.max(4, Math.ceil(playerCount / 4) * 4));
      return;
    }

    setCourts(Math.max(1, Math.floor(playerCount / 4)));
  } else if (!roundsManuallySet) {
    const playersPerGroup =
      poolBracketsEnabled && poolCount > 0 && playerCount % poolCount === 0
        ? playerCount / poolCount
        : playerCount;
    setRounds(Math.max(1, playersPerGroup - 1));
  }
}, [tournamentMode, playerCount, poolBracketsEnabled, poolCount, roundsManuallySet]);

  useEffect(() => {
    if (format === 'singles' && playerCount < 3) {
      setPlayerCount(3);
    } else if (format === 'doubles' && playerCount < 4) {
      setPlayerCount(4);
    }
  }, [format]);

  useEffect(() => {
  if (!playoffsAllowed && playoffFormat !== 'none') {
    setPlayoffFormat('none');
  }
}, [playoffsAllowed, playoffFormat]);

  useEffect(() => {
    if (!poolBracketsAvailable && poolBracketsEnabled) setPoolBracketsEnabled(false);
    if (!poolBracketsEnabled) {
      setMoneyballEnabled(false);
      setTestMode(false);
    }
  }, [poolBracketsAvailable, poolBracketsEnabled]);

  useEffect(() => {
    if (!poolBracketsEnabled || playerCount % poolCount === 0) return;
    const validPoolCount = [2, 3, 4, 5, 6, 8].find((count) => playerCount % count === 0);
    if (validPoolCount) setPoolCount(validPoolCount);
  }, [poolBracketsEnabled, playerCount, poolCount]);

  async function handleCreate() {
  setMessage('');
  setMessageIsError(true);
  setInvalidField(null);

  function showValidationError(
    nextMessage: string,
    field?: 'title' | 'location',
  ) {
    setMessage(nextMessage);
    setInvalidField(field || null);

    if (!field) return;

    window.setTimeout(() => {
      const input = document.getElementById(`tournament-${field}`);
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus({ preventScroll: true });
    }, 0);
  }

  if (!isValidSetup) {
    setMessage(`You need at least ${minPlayers} players for ${format}.`);
    return;
  }

  if (tournamentMode === 'cream_of_the_crop' && playerCount % 4 !== 0) {
    setMessage('Cream of the Crop requires players in groups of 4.');
    return;
  }

  if (poolBracketsEnabled) {
    if (!canUsePoolBrackets) {
      setMessage('Premium pool and bracket access is required.');
      return;
    }
    if (playerCount % poolCount !== 0) {
      setMessage('Players must divide evenly across the selected pools.');
      return;
    }
    const playersPerPool = playerCount / poolCount;
    if (doublesMode === 'mixed' && playersPerPool % 2 !== 0) {
      setMessage('Each mixed pool must have the same number of men and women.');
      return;
    }
    if (doublesMode === 'mixed' && poolQualifiersPerGender * 2 >= playersPerPool) {
      setMessage('Each pool needs players remaining for both championship and consolation brackets.');
      return;
    }
  }

  if (moneyballEnabled) {
    if (!poolBracketsEnabled) {
      setMessage('Moneyball currently requires pool play with postseason brackets.');
      return;
    }
    if (!selectedOrganizationId) {
      setMessage('Select an organization for this Moneyball Series.');
      return;
    }
    if (moneyballSeriesChoice === 'existing' && !selectedMoneyballSeriesId) {
      setMessage('Select an existing Moneyball Series.');
      return;
    }
    if (moneyballSeriesChoice === 'new' && newMoneyballSeriesName.trim().length < 2) {
      setMessage('Enter a name for the new Moneyball Series.');
      return;
    }
    if (moneyballBuyInDollars <= 0 || moneyballBuyInDollars % 2 !== 0) {
      setMessage('The Moneyball buy-in must be a positive whole-dollar amount that splits evenly.');
      return;
    }
  }

  if (!title.trim()) {
    showValidationError('Enter an event name before creating your tournament.', 'title');
    return;
  }

  if (!location.trim()) {
    showValidationError('Enter the club or court location before creating your tournament.', 'location');
    return;
  }

  setIsCreating(true);

  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      saveCreateTournamentDraft();
      setIsCreating(false);
      router.push(`/account?redirect=${encodeURIComponent('/tournament/create')}`);
      return;
    }

    const safeOrganizerName =
      organizerName.trim() || user.email?.split('@')[0] || 'Organizer';

    await supabase.from('profiles').upsert({
      id: user.id,
      display_name: safeOrganizerName,
      email: user.email,
    });

    const joinCode = makeJoinCode();
    let resolvedMoneyballSeriesId: string | null = null;

    if (moneyballEnabled && moneyballSeriesChoice === 'new') {
      const { data: createdSeries, error: seriesError } = await supabase
        .from('moneyball_series')
        .insert({
          organization_id: selectedOrganizationId,
          organizer_user_id: user.id,
          name: newMoneyballSeriesName.trim(),
          format,
          doubles_mode: format === 'doubles' ? doublesMode : null,
          division: doublesMode === 'mixed' ? 'mixed' : moneyballDivision,
          target_wins: 3,
          default_buy_in_cents: moneyballBuyInDollars * 100,
          is_test: testMode,
        })
        .select('id')
        .single();

      if (seriesError || !createdSeries) {
        throw new Error(seriesError?.message || 'Could not create the Moneyball Series.');
      }
      resolvedMoneyballSeriesId = createdSeries.id;
    } else if (moneyballEnabled) {
      resolvedMoneyballSeriesId = selectedMoneyballSeriesId;
    }

    const { data: tournament, error } = await supabase
      .from('tournaments')
      .insert({
        title: title.trim(),
        organizer_user_id: user.id,
        organization_id: selectedOrganizationId || null,
        moneyball_series_id: resolvedMoneyballSeriesId,
        organizer_name: safeOrganizerName,
        join_code: joinCode,
        event_date: eventDate || null,
        event_time: eventTime || null,
        location: location.trim() || null,
        player_count: playerCount,
        courts,
        rounds,
        games_to: gamesTo,
        status: 'draft',
        format,
        match_format: matchFormat,
        standings_ranking_method: standingsRankingMethod,
        doubles_mode: doublesMode,
        tournament_mode: tournamentMode,
        court_labels: courtLabels.map((label, index) => label.trim() || `Court ${index + 1}`),
        allow_player_score_reporting: allowPlayerScoreReporting || allowAnyPlayerScoreReporting,
        allow_any_player_score_reporting: allowAnyPlayerScoreReporting,
        ask_for_dupr_id: askForDuprId,
        playoff_format: playoffsAllowed ? playoffFormat : 'none',
        playoff_advance_count:
          !playoffsAllowed || playoffFormat === 'none'
            ? null
            : playoffFormat === 'everyone'
            ? playerCount
            : playoffFormat === 'top_4'
            ? 4
            : playoffFormat === 'top_8'
            ? 8
            : playoffFormat === 'top_16'
            ? 16
          : null,
        playoff_seeding_style: 'traditional',
        pool_brackets_enabled: poolBracketsEnabled,
        test_mode: poolBracketsEnabled ? testMode : false,
        pool_count: poolBracketsEnabled ? poolCount : null,
        pool_qualifiers_per_gender: poolBracketsEnabled ? poolQualifiersPerGender : null,
        bracket_match_format: poolBracketsEnabled ? bracketMatchFormat : null,
        bracket_games_to: poolBracketsEnabled ? bracketGamesTo : null,
        bracket_deciding_game_to:
          poolBracketsEnabled && bracketMatchFormat === 'best_of_3'
            ? bracketDecidingGameTo
            : null,
      })
      .select()
      .single();

    if (error || !tournament) {
      setMessage(error?.message || 'Failed to create tournament.');
      setIsCreating(false);
      return;
    }

      const playerRows = Array.from({ length: playerCount }, (_, i) => ({
        tournament_id: tournament.id,
        slot_number: i + 1,
        display_name: '',
      }));

      await supabase.from('tournament_players').insert(playerRows);

if (saveLocationForLater && location.trim()) {
  await supabase.from('favorite_locations').insert({
    user_id: user.id,
    name: favoriteLocationName.trim() || location.trim(),
    location: location.trim(),
  });
}

window.localStorage.removeItem(CREATE_TOURNAMENT_DRAFT_KEY);
router.push(`/tournament/${tournament.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }

    setIsCreating(false);
  }

  return (
    <main className="page-shell">
      <TopNav />

      <div className="card">
        <div className="grid" style={{ gap: 12 }}>

          <div>
            <div className="card-title" style={{ color: '#FFCB05', marginBottom: 6 }}>
    Game Setup
  </div>
</div>

{canUseOrganizations && organizations.length > 0 ? (
  <div>
    <label className="label">Organization</label>
    <select
      className="input"
      value={selectedOrganizationId}
      onChange={(e) => setSelectedOrganizationId(e.target.value)}
    >
      {organizations.map((organization) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
        </option>
      ))}
    </select>
    {selectedOrganizationId ? (
      <Link
        href={`/organizations/${selectedOrganizationId}/branding`}
        style={{
          display: 'inline-flex',
          marginTop: 8,
          color: '#FFCB05',
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        Edit club branding
      </Link>
    ) : null}
  </div>
) : null}
              
       <div>
  <label className="label">Tournament Mode</label>

  <div className="tournament-mode-grid">
  <button
    type="button"
    onClick={() => setTournamentMode('round_robin')}
    style={{
      minHeight: 74,
      borderRadius: 18,
      padding: '14px 10px',
      border:
        tournamentMode === 'round_robin'
          ? '1px solid rgba(255,203,5,0.9)'
          : '1px solid rgba(255,255,255,0.12)',
      background:
        tournamentMode === 'round_robin'
          ? 'linear-gradient(135deg, rgba(255,203,5,0.95), rgba(255,203,5,0.68))'
          : 'rgba(255,255,255,0.05)',
      color: tournamentMode === 'round_robin' ? '#001428' : '#ffffff',
      fontWeight: 900,
      fontSize: 15,
      boxShadow:
        tournamentMode === 'round_robin'
          ? '0 12px 28px rgba(255,203,5,0.20)'
          : 'none',
      cursor: 'pointer',
    }}
  >
        <div style={{ fontSize: 15, fontWeight: 900 }}>Round Robin</div>
    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
      Flexible scheduling
    </div>
  </button>

  <button
    type="button"
    onClick={() => {
      if (!canUseCreamOfTheCrop) return;
      setTournamentMode('cream_of_the_crop');
    }}
    style={{
      minHeight: 74,
      borderRadius: 18,
      padding: '14px 10px',
      border:
        tournamentMode === 'cream_of_the_crop'
          ? '1px solid rgba(255,203,5,0.9)'
          : '1px solid rgba(255,255,255,0.12)',
      background:
        tournamentMode === 'cream_of_the_crop'
          ? 'linear-gradient(135deg, rgba(255,203,5,0.95), rgba(255,203,5,0.68))'
          : 'rgba(255,255,255,0.05)',
      color: tournamentMode === 'cream_of_the_crop' ? '#001428' : '#ffffff',
      fontWeight: 900,
      fontSize: 15,
      boxShadow:
        tournamentMode === 'cream_of_the_crop'
          ? '0 12px 28px rgba(255,203,5,0.20)'
          : 'none',
            cursor: canUseCreamOfTheCrop ? 'pointer' : 'not-allowed',
            opacity: canUseCreamOfTheCrop ? 1 : 0.45,
      textAlign: 'center',
    }}
  >
        <div style={{ fontSize: 15, fontWeight: 900 }}>
      Cream of the Crop
    </div>
    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
      Ladder-style progression
    </div>
  </button>

  <button
    type="button"
    onClick={() => {
      if (!canUsePremiumLeagues) return;
      router.push(`/leagues/create?organizationId=${encodeURIComponent(selectedOrganizationId)}`);
    }}
    style={{
      minHeight: 74,
      borderRadius: 18,
      padding: '14px 10px',
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(255,255,255,0.05)',
      color: '#ffffff',
      fontWeight: 900,
      fontSize: 15,
      cursor: canUsePremiumLeagues ? 'pointer' : 'not-allowed',
      opacity: canUsePremiumLeagues ? 1 : 0.45,
      textAlign: 'center',
    }}
  >
    <div style={{ fontSize: 15, fontWeight: 900 }}>Premium Leagues</div>
    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
      Multi-week rotating doubles
    </div>
  </button>
</div>
</div>             

{tournamentMode === 'round_robin' ? (
  <div
    style={{
      padding: 14,
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.10)',
      background: 'rgba(255,255,255,0.035)',
    }}
  >
    <label className="label">What Are You Running?</label>
    <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
      Choose the event path first. DinkDraw will reveal the settings that apply to it.
    </div>
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        type="button"
        className={`button ${!poolBracketsEnabled ? 'primary' : 'secondary'}`}
        onClick={() => {
          setPoolBracketsEnabled(false);
          setMoneyballEnabled(false);
          setTestMode(false);
          setRoundsManuallySet(false);
        }}
      >
        Round Robin Only
      </button>
      <button
        type="button"
        className={`button ${poolBracketsEnabled && !moneyballEnabled ? 'primary' : 'secondary'}`}
        onClick={() => {
          if (!canUsePoolBrackets) {
            setMessage('Pool play with postseason brackets is a premium feature. Contact DinkDraw to upgrade.');
            return;
          }
          setFormat('doubles');
          if (doublesMode === 'fixed') setDoublesMode('rotating');
          setPoolBracketsEnabled(true);
          setMoneyballEnabled(false);
          setRoundsManuallySet(false);
          setPlayoffFormat('none');
        }}
      >
        Pool Play + Brackets {canUsePoolBrackets ? '' : '• Premium'}
      </button>
      <button
        type="button"
        className={`button ${poolBracketsEnabled && moneyballEnabled ? 'primary' : 'secondary'}`}
        onClick={() => {
          if (!canUsePoolBrackets) {
            setMessage('Moneyball requires the premium Pool Play + Postseason feature. Contact DinkDraw to upgrade.');
            return;
          }
          setFormat('doubles');
          if (doublesMode === 'fixed') setDoublesMode('rotating');
          setPoolBracketsEnabled(true);
          setMoneyballEnabled(true);
          setRoundsManuallySet(false);
          setPlayoffFormat('none');
        }}
      >
        Moneyball Series {canUsePoolBrackets ? '' : '• Premium'}
      </button>
    </div>
    {poolBracketsEnabled ? (
      <div style={{ marginTop: 10, color: '#FFCB05', fontSize: 12, fontWeight: 850 }}>
        {moneyballEnabled
          ? 'Moneyball includes pool play, championship and consolation brackets, payments, and series wins.'
          : 'Players begin in pools, then advance into championship and consolation brackets.'}
      </div>
    ) : null}
  </div>
) : null}

{tournamentMode === 'cream_of_the_crop' && (
  <div
    style={{
      marginTop: 10,
      padding: 14,
      borderRadius: 16,
      border: '1px solid rgba(255,203,5,0.25)',
      background: 'rgba(255,203,5,0.06)',
    }}
  >
 <div style={{ fontWeight: 900, marginBottom: 6, color: '#FFCB05' }}>
  Guided Cream of the Crop Setup
</div>

<div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
  Pick the number of players. DinkDraw will automatically set doubles, courts,
9 rounds, and games to 11. After creating the tournament, enter players in
seed order from strongest to weakest. Seed order determines starting courts
and final placement tie-breakers.
</div>

<div
  style={{
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
    marginTop: 12,
  }}
>
  <div
    style={{
      padding: 10,
      borderRadius: 14,
      background: 'rgba(0,20,40,0.55)',
      border: '1px solid rgba(255,255,255,0.08)',
      fontSize: 12,
      fontWeight: 800,
    }}
  >
    3 stages
  </div>

  <div
    style={{
      padding: 10,
      borderRadius: 14,
      background: 'rgba(0,20,40,0.55)',
      border: '1px solid rgba(255,255,255,0.08)',
      fontSize: 12,
      fontWeight: 800,
    }}
  >
    9 rounds
  </div>

  <div
    style={{
      padding: 10,
      borderRadius: 14,
      background: 'rgba(0,20,40,0.55)',
      border: '1px solid rgba(255,255,255,0.08)',
      fontSize: 12,
      fontWeight: 800,
    }}
  >
    Doubles only
  </div>

  <div
    style={{
      padding: 10,
      borderRadius: 14,
      background: 'rgba(0,20,40,0.55)',
      border: '1px solid rgba(255,255,255,0.08)',
      fontSize: 12,
      fontWeight: 800,
    }}
  >
    Games to 11
  </div>
</div>
  </div>
)}

          <Stepper
  label={`Players (min ${minPlayers})`}
  value={playerCount}
  min={minPlayers}
  max={40}
  onChange={(next) => {
    if (tournamentMode === 'cream_of_the_crop') {
      const diff = next - playerCount;

      if (diff > 0) {
        setPlayerCount(Math.min(40, playerCount + 4));
      } else if (diff < 0) {
        setPlayerCount(Math.max(minPlayers, playerCount - 4));
      }
    } else {
      setPlayerCount(next);
      setCourts(recommendedCourtCount(next, format));
    }
  }}
/>

   {tournamentMode === 'round_robin' ? (
  <div>
    <Stepper
      label={`Courts (recommended ${recommendedCourtCount(playerCount, format)}, max ${maxCourtsAllowed})`}
      value={courts}
      min={1}
      max={maxCourtsAllowed}
      onChange={setCourts}
    />
    {courts !== recommendedCourtCount(playerCount, format) ? (
      <button
        type="button"
        className="button secondary"
        onClick={() => setCourts(recommendedCourtCount(playerCount, format))}
        style={{ width: '100%', marginTop: 8 }}
      >
        Use Recommended ({recommendedCourtCount(playerCount, format)})
      </button>
    ) : (
      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
        Automatically adjusted for {playerCount} players. You can still choose fewer courts.
      </div>
    )}
  </div>
) : (
  <div>
    <label className="label">Courts</label>
    <div
      style={{
        height: 56,
        borderRadius: 16,
        background: '#001428',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 800,
      }}
    >
      {courts} (auto-calculated)
    </div>
  </div>
)}

          {tournamentMode === 'round_robin' && (
  <Stepper
    label={poolBracketsEnabled ? 'Pool-Play Rounds' : 'Rounds'}
    value={rounds}
    min={1}
    max={30}
    onChange={(value) => {
      setRounds(value);
      setRoundsManuallySet(true);
    }}
  />
)}

          {tournamentMode === 'round_robin' && poolBracketsEnabled ? (
            <div className="muted" style={{ marginTop: -6, fontSize: 12 }}>
              {roundsManuallySet
                ? `Custom round count. The complete-rotation recommendation is ${Math.max(1, playerCount / poolCount - 1)}.`
                : `${playerCount / poolCount} players per pool creates a ${rounds}-round complete rotation.`}
              {roundsManuallySet ? (
                <button
                  type="button"
                  onClick={() => setRoundsManuallySet(false)}
                  style={{ marginLeft: 6, padding: 0, border: 0, background: 'transparent', color: '#FFCB05', fontWeight: 900, cursor: 'pointer' }}
                >
                  Use recommended
                </button>
              ) : null}
            </div>
          ) : null}

    {tournamentMode === 'round_robin' ? (
  <Stepper
    label="Games to"
    value={gamesTo}
    min={1}
    max={21}
    onChange={setGamesTo}
  />
) : (
  <div>
    <label className="label">Games to</label>
    <div
      style={{
        height: 56,
        borderRadius: 16,
        background: '#001428',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 800,
      }}
    >
      11 (fixed)
    </div>
  </div>
)}

{courtLabels.length > 0 ? (
  <div>
    <label className="label">Court Names</label>

    <div className="grid" style={{ gap: 8 }}>
      {courtLabels.map((label, index) => (
        <input
          key={index}
          className="input"
          value={label}
          onChange={(e) => {
            const nextLabels = [...courtLabels];
            nextLabels[index] = e.target.value;
            setCourtLabels(nextLabels);
          }}
          placeholder={`Court ${index + 1}`}
        />
      ))}
    </div>
  </div>
) : null}

{tournamentMode === 'round_robin' && (
  <div style={{ display: 'grid', gap: 14 }}>
    <label className="label">Player Format</label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      <button
        type="button"
        className={`button ${format === 'doubles' ? 'primary' : 'secondary'}`}
        onClick={() => {
          setFormat('doubles');
          setCourts(recommendedCourtCount(playerCount, 'doubles'));
        }}
      >
        Doubles
      </button>
      <button
        type="button"
        className={`button ${format === 'singles' ? 'primary' : 'secondary'}`}
        onClick={() => {
          setFormat('singles');
          setCourts(recommendedCourtCount(playerCount, 'singles'));
        }}
      >
        Singles
      </button>
    </div>
    <div>
      <label className="label">How Standings Are Ranked</label>
      <select
        className="input"
        value={standingsRankingMethod}
        onChange={(event) => setStandingsRankingMethod(event.target.value as 'record_first' | 'point_diff_first')}
      >
        <option value="record_first">Win/Loss, then Point Differential</option>
        <option value="point_diff_first">Point Differential, then Head-to-Head, then Win/Loss</option>
      </select>
      <div className="muted" style={{ marginTop: 5, fontSize: 12 }}>
        This ranking order controls standings, qualifiers, and postseason seeding.
      </div>
    </div>
  </div>
)}

{tournamentMode === 'round_robin' && (
  <div>
    <label className="label">Match Format</label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      <button
        type="button"
        className={`button ${matchFormat === 'single' ? 'primary' : 'secondary'}`}
        onClick={() => setMatchFormat('single')}
      >
        Single Game
      </button>
      <button
        type="button"
        className={`button ${matchFormat === 'best_of_3' ? 'primary' : 'secondary'}`}
        onClick={() => setMatchFormat('best_of_3')}
      >
        Best of 3
      </button>
    </div>
  </div>
)}
           
                    {format === 'doubles' && tournamentMode === 'round_robin' ? (
            <div>
              <label className="label">Doubles Mode</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 6,
                }}
              >
                <button
                  type="button"
                  className={`button ${doublesMode === 'rotating' ? 'primary' : 'secondary'}`}
                  onClick={() => setDoublesMode('rotating')}
                >
                  Rotating
                </button>
                <button
                  type="button"
                  className={`button ${doublesMode === 'fixed' ? 'primary' : 'secondary'}`}
                  onClick={() => setDoublesMode('fixed')}
                >
                  Fixed Partners
                </button>
                <button
                  type="button"
                  className={`button ${doublesMode === 'mixed' ? 'primary' : 'secondary'}`}
                  onClick={() => setDoublesMode('mixed')}
                >
                  Mixed Rotate
                </button>
              </div>
            </div>
          ) : null}

{poolBracketsAvailable ? (
  <div
    style={{
      border: '1px solid rgba(255,203,5,0.24)',
      borderRadius: 14,
      padding: 14,
      background: 'rgba(255,203,5,0.05)',
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <div>
        <div className="card-title" style={{ fontSize: 17 }}>Pool Play + Postseason Brackets</div>
        <div className="muted" style={{ fontSize: 12 }}>Individual pool standings, then permanent partnerships.</div>
      </div>
      <span style={{ color: '#FFCB05', fontWeight: 900, fontSize: 12 }}>PREMIUM</span>
    </div>

    <button
      type="button"
      className={`button ${poolBracketsEnabled ? 'primary' : 'secondary'}`}
      onClick={() => {
        if (!canUsePoolBrackets) {
          setMessage('Pool play with postseason brackets is a premium feature. Contact DinkDraw to upgrade.');
          return;
        }
        setPoolBracketsEnabled((enabled) => {
          const next = !enabled;
          if (next) setRoundsManuallySet(false);
          return next;
        });
        setPlayoffFormat('none');
      }}
      style={{ marginTop: 12, width: '100%' }}
    >
      {poolBracketsEnabled ? 'Postseason Enabled' : canUsePoolBrackets ? 'Enable Postseason' : 'Unlock Premium Postseason'}
    </button>

    {poolBracketsEnabled ? (
      <div className="grid" style={{ gap: 12, marginTop: 14 }}>
        <div style={{ padding: 14, borderRadius: 14, border: '1px solid rgba(167,139,250,0.38)', background: 'rgba(167,139,250,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div className="card-title" style={{ fontSize: 17 }}>Test Mode</div>
              <div className="muted" style={{ fontSize: 12 }}>Start with organizer-entered names without requiring players to claim accounts.</div>
            </div>
            <button
              type="button"
              className={`button ${testMode ? 'primary' : 'secondary'}`}
              onClick={() => {
                setTestMode((enabled) => {
                  const next = !enabled;
                  return next;
                });
              }}
              style={{ width: 'auto', minWidth: 100 }}
            >
              {testMode ? 'Testing' : 'Off'}
            </button>
          </div>
          {testMode ? <div style={{ marginTop: 9, color: '#C4B5FD', fontSize: 12, fontWeight: 850 }}>Test tournaments stay private from public Moneyball standings. Link accounts if you want to test individual payments and wins.</div> : null}
        </div>

        <div style={{ padding: 14, borderRadius: 14, border: '1px solid rgba(34,197,94,0.32)', background: 'rgba(34,197,94,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div className="card-title" style={{ fontSize: 17 }}>Moneyball Event</div>
              <div className="muted" style={{ fontSize: 12 }}>Connect weekly wins and grand-prize money to one named series.</div>
            </div>
            <button
              type="button"
              className={`button ${moneyballEnabled ? 'primary' : 'secondary'}`}
              onClick={() => {
                setMoneyballEnabled((enabled) => !enabled);
              }}
              style={{ width: 'auto', minWidth: 110 }}
            >
              {moneyballEnabled ? (testMode ? 'Test Moneyball' : 'Live Moneyball') : 'Not Moneyball'}
            </button>
          </div>

          {moneyballEnabled ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {!selectedOrganizationId ? (
                <div style={{ color: '#FCA5A5', fontSize: 13, fontWeight: 850 }}>Select an organization above before creating a Moneyball event.</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    <button type="button" className={`button ${moneyballSeriesChoice === 'existing' ? 'primary' : 'secondary'}`} onClick={() => setMoneyballSeriesChoice('existing')} disabled={!compatibleMoneyballSeries.length}>Continue Series</button>
                    <button type="button" className={`button ${moneyballSeriesChoice === 'new' ? 'primary' : 'secondary'}`} onClick={() => setMoneyballSeriesChoice('new')}>Create New Series</button>
                  </div>

                  {moneyballSeriesChoice === 'existing' ? (
                    <div>
                      <label className="label">Moneyball Series</label>
                      <select className="input" value={selectedMoneyballSeriesId} onChange={(event) => {
                        const seriesId = event.target.value;
                        setSelectedMoneyballSeriesId(seriesId);
                        const series = moneyballSeries.find((item) => item.id === seriesId);
                        if (series) setMoneyballBuyInDollars(series.default_buy_in_cents / 100);
                      }}>
                        {compatibleMoneyballSeries.map((series) => (
                          <option key={series.id} value={series.id}>
                            {series.is_test ? '[TEST] ' : ''}{series.name} • {series.division === 'mens' ? "Men's" : series.division === 'womens' ? "Women's" : series.division === 'mixed' ? 'Mixed' : 'Open'} • Race to {series.target_wins}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div>
                        <label className="label">New Series Name</label>
                        <input className="input" value={newMoneyballSeriesName} onChange={(event) => setNewMoneyballSeriesName(event.target.value)} placeholder={doublesMode === 'mixed' ? 'Club 65 Mixed Moneyball' : 'Club 65 Moneyball'} />
                      </div>
                      <div>
                        <label className="label">Series Division</label>
                        <select className="input" value={moneyballDivision} onChange={(event) => setMoneyballDivision(event.target.value as 'mixed' | 'mens' | 'womens' | 'open')} disabled={doublesMode === 'mixed'}>
                          {doublesMode === 'mixed' ? <option value="mixed">Mixed</option> : null}
                          {doublesMode !== 'mixed' ? <>
                            <option value="mens">Men&apos;s</option>
                            <option value="womens">Women&apos;s</option>
                            <option value="open">Open</option>
                          </> : null}
                        </select>
                        <div className="muted" style={{ marginTop: 5, fontSize: 12 }}>Wins and prize money stay isolated within this club and division.</div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label">Buy-In Per Player</label>
                    <select className="input" value={moneyballBuyInDollars} onChange={(event) => setMoneyballBuyInDollars(Number(event.target.value))} disabled={moneyballSeriesChoice === 'existing'}>
                      {[10, 20, 30, 40, 50].map((amount) => <option key={amount} value={amount}>${amount} • ${amount / 2} daily + ${amount / 2} grand prize</option>)}
                    </select>
                    <div className="muted" style={{ marginTop: 5, fontSize: 12 }}>Series format: {doublesMode === 'mixed' ? 'Mixed Doubles' : doublesMode === 'rotating' ? 'Rotating Doubles' : 'Doubles'} • First to 3 wins.</div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div>
          <label className="label">Number of Pools</label>
          <select className="input" value={poolCount} onChange={(event) => setPoolCount(Number(event.target.value))}>
            {[2, 3, 4, 5, 6, 8].filter((count) => playerCount % count === 0).map((count) => (
              <option key={count} value={count}>{count} pools ({playerCount / count} players each)</option>
            ))}
          </select>
        </div>

        {doublesMode === 'mixed' ? (
          <div>
            <label className="label">Championship Qualifiers Per Pool</label>
            <select className="input" value={poolQualifiersPerGender} onChange={(event) => setPoolQualifiersPerGender(Number(event.target.value))}>
              {Array.from({ length: Math.max(1, Math.floor(playerCount / poolCount / 2) - 1) }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>Top {count} men + top {count} women</option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>Remaining players enter the consolation bracket.</div>
          </div>
        ) : null}

        <div>
          <label className="label">Bracket Match Format</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <button type="button" className={`button ${bracketMatchFormat === 'single' ? 'primary' : 'secondary'}`} onClick={() => setBracketMatchFormat('single')}>Single Game</button>
            <button type="button" className={`button ${bracketMatchFormat === 'best_of_3' ? 'primary' : 'secondary'}`} onClick={() => setBracketMatchFormat('best_of_3')}>Best of 3</button>
          </div>
        </div>

        <div>
          <label className="label">Bracket Games Play To</label>
          <select className="input" value={bracketGamesTo} onChange={(event) => setBracketGamesTo(Number(event.target.value))}>
            {[11, 15, 21].map((score) => <option key={score} value={score}>{score}</option>)}
          </select>
        </div>

        {bracketMatchFormat === 'best_of_3' ? (
          <div>
            <label className="label">Deciding Third Game Plays To</label>
            <select className="input" value={bracketDecidingGameTo} onChange={(event) => setBracketDecidingGameTo(Number(event.target.value))}>
              {[11, 15, 21].map((score) => <option key={score} value={score}>{score}</option>)}
            </select>
          </div>
        ) : null}
      </div>
    ) : null}
  </div>
) : null}

{playoffsAllowed && !poolBracketsEnabled ? (
  <div>
    <label className="label">Playoff Bracket</label>

    <div style={{ position: 'relative' }}>
      <select
        className="input"
        value={playoffFormat}
        onChange={(e) =>
          setPlayoffFormat(e.target.value as typeof playoffFormat)
        }
        style={{
          width: '100%',
          background: 'rgba(0,0,0,0.35)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '12px 40px 12px 14px',
          fontWeight: 700,
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
        }}
      >
        <option value="none">No playoff bracket</option>
        <option value="everyone">Everyone advances</option>
        <option value="top_4">Top 4 advance</option>
        <option value="top_8">Top 8 advance</option>
        <option value="top_16">Top 16 advance</option>
      </select>

      <div
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: '#FFCB05',
          fontSize: 14,
          fontWeight: 900,
        }}
      >
        ▼
      </div>
    </div>

    {/* 👇 THIS IS YOUR NEW TEXT */}
    <div
      style={{
        marginTop: 6,
        fontSize: 12,
        lineHeight: 1.35,
        color: 'rgba(255,255,255,0.58)',
      }}
    >
      Top seeds automatically receive byes when the bracket needs them.
    </div>
  </div>
) : null}         

            <div>
            <div className="card-title" style={{ marginTop: 14 }}>
              Event Details
            </div>

            <label className="label">Event name</label>
            <input
              id="tournament-title"
              className="input"
              aria-invalid={invalidField === 'title'}
              aria-describedby={invalidField === 'title' ? 'tournament-title-error' : undefined}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (invalidField === 'title') {
                  setInvalidField(null);
                  setMessage('');
                  setMessageIsError(false);
                }
              }}
            />
            {invalidField === 'title' ? (
              <div id="tournament-title-error" className="field-validation-error">
                Event name is required.
              </div>
            ) : null}
          </div>

          <div>
            <label className="label">Organizer name</label>
            <input
              className="input"
              value={organizerName}
              onChange={(e) => setOrganizerName(e.target.value)}
            />
          </div>

          <div style={{ maxWidth: 310 }}>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>

          <div style={{ maxWidth: 310 }}>
            <label className="label">Time</label>
            <input
              className="input"
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Location *</label>

            {favoriteLocations.length ? (
              <div style={{ marginBottom: 10 }}>
                <select
                  className="input"
                  value={selectedFavoriteLocationId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setSelectedFavoriteLocationId(selectedId);

                    const selected = favoriteLocations.find((item) => item.id === selectedId);
                    if (selected) {
                      setLocation(selected.location);
                      setFavoriteLocationName(selected.name);
                      if (invalidField === 'location') {
                        setInvalidField(null);
                        setMessage('');
                        setMessageIsError(false);
                      }
                    }
                  }}
                >
                  <option value="">Use saved location…</option>
                  {favoriteLocations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {!selectedFavoriteLocationId ? (
              <LocationAutocomplete
                id="tournament-location"
                required
                invalid={invalidField === 'location'}
                describedBy={invalidField === 'location' ? 'tournament-location-error' : undefined}
                value={location}
                onChange={(nextLocation) => {
                  setLocation(nextLocation);
                  setSelectedFavoriteLocationId('');
                  if (invalidField === 'location') {
                    setInvalidField(null);
                    setMessage('');
                    setMessageIsError(false);
                  }
                }}
              />
            ) : null}
            {invalidField === 'location' ? (
              <div id="tournament-location-error" className="field-validation-error">
                Club or court location is required.
              </div>
            ) : null}
          </div>

          <div className="card-title" style={{ marginTop: 14 }}>
            Optional Settings
          </div>

          <div
            className="list-item"
            style={{
              padding: 12,
              borderRadius: 16,
              border: '1px solid rgba(255,203,5,0.18)',
              background: 'rgba(255,203,5,0.05)',
            }}
          >
            <label className="label">Saved Location</label>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <input
                type="checkbox"
                checked={saveLocationForLater}
                onChange={(e) => setSaveLocationForLater(e.target.checked)}
                style={{ marginTop: 4 }}
              />

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>
                  Save this location for next time
                </div>

                {saveLocationForLater ? (
                  <input
                    className="input"
                    value={favoriteLocationName}
                    onChange={(e) => setFavoriteLocationName(e.target.value)}
                    placeholder="Location nickname, like Legacy Courts"
                    style={{ marginTop: 10 }}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div
            className="list-item"
            style={{
              padding: 12,
              borderRadius: 16,
              border: '1px solid rgba(255,203,5,0.18)',
              background: 'rgba(255,203,5,0.05)',
            }}
          >
            <label className="label">Score Reporting</label>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <input
                type="checkbox"
                checked={allowPlayerScoreReporting}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAllowPlayerScoreReporting(checked);
                  if (!checked) setAllowAnyPlayerScoreReporting(false);
                }}
                style={{ marginTop: 4 }}
              />

              <div>
                <div style={{ fontWeight: 800 }}>
                  Allow players to submit their own match scores
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Players can enter scores only for matches they are playing in.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 12 }}>
              <input
                type="checkbox"
                checked={allowAnyPlayerScoreReporting}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAllowAnyPlayerScoreReporting(checked);
                  if (checked) setAllowPlayerScoreReporting(true);
                }}
                style={{ marginTop: 4 }}
              />

              <div>
                <div style={{ fontWeight: 800 }}>
                  Allow players to submit scores for any match
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Use this when you trust players to help enter scores from other courts.
                </div>
              </div>
            </div>
          </div>

          <div
  className="list-item"
  style={{
    padding: 12,
    borderRadius: 16,
    border: '1px solid rgba(255,203,5,0.18)',
    background: 'rgba(255,203,5,0.05)',
  }}
>
  <label className="label">DUPR</label>

  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <input
      type="checkbox"
      checked={askForDuprId}
      onChange={(e) => setAskForDuprId(e.target.checked)}
      style={{ marginTop: 4 }}
    />

    <div>
      <div style={{ fontWeight: 800 }}>
        Ask players for DUPR ID during signup
      </div>

      <div
        style={{
          fontSize: 13,
          opacity: 0.75,
          marginTop: 4,
        }}
      >
        Optional. DUPR IDs will be included in tournament CSV exports for manual DUPR submission.
      </div>
    </div>
  </div>
</div>

          <div className="card-title" style={{ marginTop: 14 }}>
            Review
          </div>
 
          <div
  className="list-item"
  style={{
    border: '1px solid rgba(255,203,5,0.25)',
    background: 'rgba(255,203,5,0.06)',
  }}
>
  <div
    style={{
      fontWeight: 800,
      marginBottom: 6,
      color: '#FFCB05',
      fontSize: 15,
    }}
  >
    Tournament Summary
  </div>

    <div style={{ fontSize: 15, lineHeight: 1.5 }}>
  <div style={{ fontWeight: 800 }}>
    {playerCount} players • {courts} courts
  </div>

  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
    {tournamentMode === 'cream_of_the_crop'
      ? 'Cream of the Crop • 9 rounds • Doubles'
      : `${format === 'singles' ? 'Singles' : 'Doubles'} • ${
          matchFormat === 'best_of_3' ? 'Best of 3' : 'Single Game'
        } • ${rounds} rounds`}
  </div>
</div> 
</div>

          <div className="muted" style={{ marginBottom: 8, textAlign: 'center' }}>
  Review your setup, then create your tournament
</div>

<div style={{ marginTop: 16, marginBottom: 8 }}>
  {message ? (
    <div
      className={`notice ${messageIsError ? 'create-tournament-feedback' : ''}`}
      role={messageIsError ? 'alert' : 'status'}
      aria-live={messageIsError ? 'assertive' : 'polite'}
    >
      {messageIsError ? <strong>Check your setup</strong> : null}
      <div>{message}</div>
    </div>
  ) : null}

  <button
    type="button"
    className="button primary"
    onClick={handleCreate}
    disabled={isCreating}
    style={{
  height: 60,
  fontSize: 17,
  borderRadius: 18,
  fontWeight: 900,
  letterSpacing: 0.2,
  boxShadow: '0 14px 32px rgba(255,203,5,0.25)',
}}
  >
    {isCreating ? 'Creating...' : 'Create Tournament'}
  </button>
</div>
        </div>
      </div>
    </main>
  );
}
