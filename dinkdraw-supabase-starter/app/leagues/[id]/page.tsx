'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { TopNav } from '../../../components/TopNav';
import { sendLeaguePushEvent } from '../../../lib/league-push';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

type League = {
  id: string;
  name: string;
  organizer_user_id: string;
  status: string;
  join_code: string;
  start_date: string;
  session_count: number;
  regular_player_count: number;
  matches_per_opponent: number;
  games_to: number;
  default_time: string | null;
  default_location: string | null;
  organizations: { name: string } | null;
};
type Member = { id: string; roster_position: number | null; display_name: string | null; user_id: string | null; member_type: 'regular' | 'substitute'; status: string };
type Session = { id: string; session_number: number; scheduled_date: string; scheduled_time: string | null; status: string; tournament_id: string | null };
type Team = { id: string; session_id: string; team_number: number; regular_player_1_id: string; regular_player_2_id: string };
type Attendance = { session_id: string; regular_member_id: string; attendance_status: string; substitute_member_id: string | null; organizer_confirmed_at: string | null; note: string | null };
type SessionPlayer = { session_id: string; team_number: number; regular_member_id: string; actual_member_id: string; tournament_player_id: string };
type Standing = {
  standing_rank: number; regular_member_id: string; display_name: string; adjusted_wins: number;
  point_differential: number; total_wins: number; regular_wins: number; regular_sessions: number;
  regular_average: number; substitute_wins: number; substitute_sessions: number;
  substitute_average: number; substitute_adjustment: number; completed_sessions: number;
};

export default function LeaguePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [substitutes, setSubstitutes] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [userId, setUserId] = useState('');
  const [selectedSession, setSelectedSession] = useState(1);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [substituteName, setSubstituteName] = useState('');
  const [substituteEmail, setSubstituteEmail] = useState('');
  const [startingSession, setStartingSession] = useState(false);
  const [copiedPosition, setCopiedPosition] = useState<number | null>(null);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    setUserId(authData.user?.id || '');
    if (!authData.user) {
      setMessage('Sign in to view this league.');
      setLoading(false);
      return;
    }

    const [leagueResult, memberResult, sessionResult, standingsResult] = await Promise.all([
      supabase.from('leagues').select('*, organizations(name)').eq('id', params.id).maybeSingle(),
      supabase.from('league_members').select('id, roster_position, display_name, user_id, member_type, status').eq('league_id', params.id).order('roster_position'),
      supabase.from('league_sessions').select('id, session_number, scheduled_date, scheduled_time, status, tournament_id').eq('league_id', params.id).order('session_number'),
      supabase.rpc('get_league_standings', { p_league_id: params.id }),
    ]);

    if (leagueResult.error || !leagueResult.data) {
      setMessage(leagueResult.error?.message || 'League not found.');
      setLoading(false);
      return;
    }

    const loadedSessions = (sessionResult.data || []) as Session[];
    const sessionIds = loadedSessions.map((session) => session.id);
    const [teamResult, attendanceResult, sessionPlayerResult] = sessionIds.length
      ? await Promise.all([
          supabase.from('league_session_teams').select('*').in('session_id', sessionIds).order('team_number'),
          supabase.from('league_session_attendance').select('session_id, regular_member_id, attendance_status, substitute_member_id, organizer_confirmed_at, note').in('session_id', sessionIds),
          supabase.from('league_session_players').select('session_id, team_number, regular_member_id, actual_member_id, tournament_player_id').in('session_id', sessionIds),
        ])
      : [{ data: [] as Team[], error: null }, { data: [] as Attendance[], error: null }, { data: [] as SessionPlayer[], error: null }];

    setLeague(leagueResult.data as unknown as League);
    const allMembers = (memberResult.data || []) as Member[];
    setMembers(allMembers.filter((member) => member.member_type === 'regular'));
    setSubstitutes(allMembers.filter((member) => member.member_type === 'substitute'));
    setSessions(loadedSessions);
    setTeams((teamResult.data || []) as Team[]);
    setAttendance((attendanceResult.data || []) as Attendance[]);
    setSessionPlayers((sessionPlayerResult.data || []) as SessionPlayer[]);
    setStandings((standingsResult.data || []) as Standing[]);
    setMessage(memberResult.error?.message || sessionResult.error?.message || standingsResult.error?.message || teamResult.error?.message || attendanceResult.error?.message || sessionPlayerResult.error?.message || '');
    setLoading(false);
  }

  useEffect(() => { void load(); }, [params.id, supabase]);

  const isOrganizer = league?.organizer_user_id === userId;
  const allMembers = [...members, ...substitutes];
  const membersById = new Map(allMembers.map((member) => [member.id, member]));
  const selectedSessionRow = sessions.find((session) => session.session_number === selectedSession);
  const selectedTeams = teams.filter((team) => team.session_id === selectedSessionRow?.id);
  const selectedAttendance = attendance.filter((row) => row.session_id === selectedSessionRow?.id);
  const selectedSessionPlayers = sessionPlayers.filter((row) => row.session_id === selectedSessionRow?.id);
  const myRegularMember = members.find((member) => member.user_id === userId);
  const mySubstituteMember = substitutes.find((member) => member.user_id === userId);
  const unclaimedRegulars = members.filter((member) => !member.user_id);
  const unresolvedAttendance = selectedAttendance.filter((row) =>
    ['unsure', 'sub_needed', 'sub_invited', 'absent'].includes(row.attendance_status)
    || (row.attendance_status === 'sub_confirmed' && !row.organizer_confirmed_at)
  );
  const sessionReady = unclaimedRegulars.length === 0 && unresolvedAttendance.length === 0;
  const memberName = (id: string) => {
    const member = membersById.get(id);
    return member?.display_name?.trim() || `Player ${member?.roster_position || '?'}`;
  };

  async function copyClaimLink(rosterPosition: number | null) {
    if (!league || !rosterPosition) return;
    const claimUrl = `${window.location.origin}/leagues/join?code=${encodeURIComponent(league.join_code)}&position=${rosterPosition}`;
    try {
      await navigator.clipboard.writeText(claimUrl);
      setCopiedPosition(rosterPosition);
      window.setTimeout(() => setCopiedPosition((current) => current === rosterPosition ? null : current), 2000);
    } catch {
      window.prompt(`Copy this claim link for Player ${rosterPosition}:`, claimUrl);
    }
  }

  async function saveRoster() {
    setSaving(true);
    setMessage('');
    const updates = members.map((member) =>
      supabase.from('league_members').update({
        display_name: member.display_name?.trim() || null,
        status: member.display_name?.trim() ? 'active' : 'invited',
        updated_at: new Date().toISOString(),
      }).eq('id', member.id)
    );
    const results = await Promise.all(updates);
    const error = results.find((result) => result.error)?.error;
    setMessage(error?.message || 'Roster saved.');
    setSaving(false);
  }

  async function setMyAttendance(status: 'playing' | 'unsure' | 'sub_needed') {
    if (!selectedSessionRow) return;
    const { error } = await supabase.rpc('set_my_league_attendance', {
      p_session_id: selectedSessionRow.id, p_status: status, p_note: null,
    });
    setMessage(error?.message || 'Attendance updated.');
    if (!error) await load();
  }

  async function addSubstitute() {
    if (!league) return;
    const { error } = await supabase.rpc('add_league_substitute', {
      p_league_id: league.id, p_email: substituteEmail.trim(), p_display_name: substituteName.trim(),
    });
    setMessage(error?.message || 'Approved substitute added.');
    if (!error) { setSubstituteEmail(''); setSubstituteName(''); await load(); }
  }

  async function inviteSubstitute(regularMemberId: string, substituteMemberId: string) {
    if (!selectedSessionRow) return;
    const { error } = await supabase.from('league_session_attendance').update({
      attendance_status: 'sub_invited', substitute_member_id: substituteMemberId || null,
      substitute_accepted_at: null, organizer_confirmed_at: null, updated_at: new Date().toISOString(),
    }).eq('session_id', selectedSessionRow.id).eq('regular_member_id', regularMemberId);
    setMessage(error?.message || 'Substitute invited.');
    if (!error) {
      void sendLeaguePushEvent(supabase, { eventType: 'substitute_invited', sessionId: selectedSessionRow.id, regularMemberId });
      await load();
    }
  }

  async function respondToInvitation(regularMemberId: string, accept: boolean) {
    if (!selectedSessionRow) return;
    const { error } = await supabase.rpc('respond_to_substitute_invitation', {
      p_session_id: selectedSessionRow.id, p_regular_member_id: regularMemberId, p_accept: accept,
    });
    setMessage(error?.message || (accept ? 'Substitute assignment accepted.' : 'Invitation declined.'));
    if (!error) {
      void sendLeaguePushEvent(supabase, { eventType: 'substitute_response', sessionId: selectedSessionRow.id, regularMemberId, accepted: accept });
      await load();
    }
  }

  async function confirmSubstitute(regularMemberId: string) {
    if (!selectedSessionRow) return;
    const { error } = await supabase.from('league_session_attendance').update({
      organizer_confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('session_id', selectedSessionRow.id).eq('regular_member_id', regularMemberId).eq('attendance_status', 'sub_confirmed');
    setMessage(error?.message || 'Substitute confirmed by organizer.');
    if (!error) await load();
  }

  async function setOrganizerAttendance(regularMemberId: string, status: string) {
    if (!selectedSessionRow || selectedSessionRow.tournament_id) return;
    const { error } = await supabase.from('league_session_attendance').update({
      attendance_status: status,
      substitute_member_id: null,
      substitute_accepted_at: null,
      organizer_confirmed_at: null,
      updated_at: new Date().toISOString(),
    }).eq('session_id', selectedSessionRow.id).eq('regular_member_id', regularMemberId);
    setMessage(error?.message || 'Attendance updated by organizer.');
    if (!error) await load();
  }

  async function startSelectedSession() {
    if (!selectedSessionRow) return;
    if (selectedSessionRow.tournament_id) {
      router.push(`/tournament/${selectedSessionRow.tournament_id}`);
      return;
    }
    const confirmed = window.confirm(
      `Create and start Week ${selectedSessionRow.session_number}? Team assignments and actual players will be locked into a DinkDraw tournament.`
    );
    if (!confirmed) return;
    setStartingSession(true); setMessage('Creating the league session tournament...');
    const { data, error } = await supabase.rpc('start_league_session_tournament', { p_session_id: selectedSessionRow.id });
    setStartingSession(false);
    if (error || !data) { setMessage(error?.message || 'Could not start this session.'); return; }
    void sendLeaguePushEvent(supabase, { eventType: 'session_started', sessionId: selectedSessionRow.id });
    router.push(`/tournament/${data}`);
  }

  function requestAttendanceResponses() {
    if (!selectedSessionRow) return;
    void sendLeaguePushEvent(supabase, { eventType: 'attendance_requested', sessionId: selectedSessionRow.id });
    setMessage(`Attendance reminders requested for Week ${selectedSessionRow.session_number}.`);
  }

  function sendStandingsUpdate() {
    if (!selectedSessionRow) return;
    void sendLeaguePushEvent(supabase, { eventType: 'standings_updated', sessionId: selectedSessionRow.id });
    setMessage(`Standings update requested for Week ${selectedSessionRow.session_number}.`);
  }

  if (loading) return <main className="page-shell"><TopNav /><div className="card"><div className="muted">Loading league...</div></div></main>;
  if (!league) return <main className="page-shell"><TopNav /><div className="notice">{message}</div></main>;

  return (
    <main className="page-shell">
      <TopNav />

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
          <div>
            <div className="card-title" style={{ color: '#FFCB05' }}>{league.name}</div>
            <div className="card-subtitle">
              {league.organizations?.name} • Rotating Doubles • {league.regular_player_count} players
            </div>
          </div>
          <span className="tag" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>{league.status === 'draft' ? 'Setting up' : league.status}</span>
        </div>
        <div className="notice" style={{ marginTop: 14 }}>
          <strong>League code: {league.join_code}</strong><br />
          {league.matches_per_opponent} consecutive matches against every weekly opponent, played to {league.games_to}.
        </div>
      </div>

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Season standings</div>
        <div className="card-subtitle">Ranked by adjusted wins, then point differential. Only completed weekly sessions count.</div>
        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#94a3b8' }}>
              <th style={{ padding: 8 }}>Rank</th><th style={{ padding: 8 }}>Player</th>
              <th style={{ padding: 8 }}>Adjusted wins</th><th style={{ padding: 8 }}>Point diff</th>
              <th style={{ padding: 8 }}>Regular</th><th style={{ padding: 8 }}>Sub-covered</th>
              <th style={{ padding: 8 }}>Sessions</th>
            </tr></thead>
            <tbody>{standings.map((standing) => (
              <tr key={standing.regular_member_id} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <td style={{ padding: 8, color: '#FFCB05', fontWeight: 900 }}>{standing.standing_rank}</td>
                <td style={{ padding: 8, fontWeight: 800 }}>{standing.display_name}</td>
                <td style={{ padding: 8, fontWeight: 900 }}>{Number(standing.adjusted_wins).toFixed(1)}</td>
                <td style={{ padding: 8 }}>{standing.point_differential > 0 ? '+' : ''}{standing.point_differential}</td>
                <td style={{ padding: 8 }}>{standing.regular_wins} wins / {standing.regular_sessions} days</td>
                <td style={{ padding: 8 }}>{standing.substitute_wins} wins / {standing.substitute_sessions} days</td>
                <td style={{ padding: 8 }}>{standing.completed_sessions}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!standings.some((standing) => standing.completed_sessions > 0) ? <div className="muted" style={{ marginTop: 12 }}>Standings will populate after the first weekly tournament is completed.</div> : null}
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 800 }}>How substitute adjustments work</summary>
          <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
            Substitute wins count up to the regular player’s average wins per attended session. A substitute cannot raise a regular player above that player’s demonstrated pace. Actual wins and the adjustment remain visible for transparency.
          </div>
          {standings.filter((standing) => standing.substitute_sessions > 0).map((standing) => (
            <div className="notice" key={standing.regular_member_id} style={{ marginTop: 8 }}>
              <strong>{standing.display_name}</strong>: {standing.total_wins} actual wins {standing.substitute_adjustment < 0 ? `− ${Math.abs(Number(standing.substitute_adjustment)).toFixed(1)} substitute adjustment` : '• no substitute reduction'} = {Number(standing.adjusted_wins).toFixed(1)} adjusted wins
            </div>
          ))}
        </details>
      </section>

      <div className="grid two" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-title">Regular roster</div>
          <div className="card-subtitle">Enter each player’s name, save the roster, then send each player their claim link. They must sign in to DinkDraw and claim their position so matches count toward their stats.</div>
          {isOrganizer && unclaimedRegulars.length ? (
            <div className="notice" style={{ marginTop: 12 }}>
              <strong>Player account setup: {members.length - unclaimedRegulars.length} of {members.length} claimed</strong><br />
              Saving names does not connect DinkDraw accounts. Use the buttons below to send each player their personal claim link.
            </div>
          ) : null}
          <div className="grid" style={{ gap: 8, marginTop: 14 }}>
            {members.map((member) => (
              <div key={member.id} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', alignItems: 'center', gap: 8 }}>
                <strong style={{ textAlign: 'center', color: '#FFCB05' }}>{member.roster_position}</strong>
                <div>
                  {isOrganizer ? (
                    <input
                      className="input"
                      value={member.display_name || ''}
                      placeholder={`Player ${member.roster_position}`}
                      onChange={(event) => setMembers((current) => current.map((item) => item.id === member.id ? { ...item, display_name: event.target.value } : item))}
                    />
                  ) : <div>{memberName(member.id)}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    <span className={`tag ${member.user_id ? 'yours' : ''}`}>
                      {member.user_id ? 'Claimed' : 'Waiting for player'}
                    </span>
                    {isOrganizer && !member.user_id ? (
                      <button className="button secondary" type="button" style={{ width: 'auto', padding: '7px 10px' }} onClick={() => copyClaimLink(member.roster_position)}>
                        {copiedPosition === member.roster_position ? 'Link copied' : 'Copy claim link'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {isOrganizer ? (
            <button type="button" className="button primary" onClick={saveRoster} disabled={saving} style={{ marginTop: 14 }}>
              {saving ? 'Saving...' : 'Save Roster'}
            </button>
          ) : null}
        </section>

        <section className="card">
          <div className="card-title">Partnership plan</div>
          <div className="card-subtitle">Every player gets a new partner each session before any partnership repeats.</div>
          <div style={{ overflowX: 'auto', marginTop: 14, paddingBottom: 4 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`button ${selectedSession === session.session_number ? 'primary' : 'secondary'}`}
                  style={{ width: 'auto', whiteSpace: 'nowrap' }}
                  onClick={() => setSelectedSession(session.session_number)}
                >
                  Week {session.session_number}
                </button>
              ))}
            </div>
          </div>
          {selectedSessionRow ? (
            <div className="muted" style={{ margin: '12px 0' }}>
              {new Date(`${selectedSessionRow.scheduled_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              {selectedSessionRow.scheduled_time ? ` • ${selectedSessionRow.scheduled_time}` : ''}
            </div>
          ) : null}
          <div className="grid" style={{ gap: 8 }}>
            {selectedTeams.map((team) => (
              <div key={team.id} className="notice">
                <strong>Team {team.team_number}</strong><br />
                {memberName(team.regular_player_1_id)} + {memberName(team.regular_player_2_id)}
              </div>
            ))}
          </div>
          {isOrganizer && selectedSessionRow ? (
            <>
            {!selectedSessionRow.tournament_id ? <div className={`notice`} style={{ marginTop: 14 }}>
              <strong>{sessionReady ? 'Ready to create the live tournament' : 'Session setup is incomplete'}</strong><br />
              {unclaimedRegulars.length ? `${unclaimedRegulars.length} player account${unclaimedRegulars.length === 1 ? '' : 's'} still need to claim their roster positions. Use the claim links in the Regular roster section. ` : ''}
              {unresolvedAttendance.length ? `${unresolvedAttendance.length} attendance item(s) need resolution.` : ''}
              {sessionReady ? 'All regular positions and substitute assignments are resolved.' : ''}
            </div> : null}
            <button className="button primary" type="button" onClick={startSelectedSession} disabled={startingSession || (!selectedSessionRow.tournament_id && !sessionReady)} style={{ marginTop: 14 }}>
              {startingSession ? 'Creating Tournament...' : selectedSessionRow.tournament_id ? 'Open Live Tournament' : `Create and Start Week ${selectedSession}`}
            </button>
            </>
          ) : selectedSessionRow?.tournament_id ? (
            <button className="button primary" type="button" onClick={() => router.push(`/tournament/${selectedSessionRow.tournament_id}`)} style={{ marginTop: 14 }}>Open Live Tournament</button>
          ) : null}
          {isOrganizer && selectedSessionRow?.status === 'completed' ? <button className="button secondary" type="button" onClick={sendStandingsUpdate} style={{ marginTop: 8 }}>Notify Players: Standings Updated</button> : null}
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Week {selectedSession} attendance</div>
        <div className="card-subtitle">Regular positions and the people who will actually play are tracked separately.</div>
        {isOrganizer && !selectedSessionRow?.tournament_id ? <button className="button secondary" type="button" onClick={requestAttendanceResponses} style={{ width: 'auto', marginTop: 12 }}>Send Attendance Reminder</button> : null}

        {myRegularMember && !selectedSessionRow?.tournament_id ? <div className="grid" style={{ gap: 8, marginTop: 14 }}>
          <div className="label">My response</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="button secondary" style={{ width: 'auto' }} onClick={() => setMyAttendance('playing')}>I’m playing</button>
            <button className="button secondary" style={{ width: 'auto' }} onClick={() => setMyAttendance('unsure')}>Unsure</button>
            <button className="button secondary" style={{ width: 'auto' }} onClick={() => setMyAttendance('sub_needed')}>I need a substitute</button>
          </div>
        </div> : null}

        {mySubstituteMember ? selectedAttendance.filter((row) => row.substitute_member_id === mySubstituteMember.id && row.attendance_status === 'sub_invited').map((row) => (
          <div className="notice" key={row.regular_member_id} style={{ marginTop: 14 }}>
            Substitute invitation for {memberName(row.regular_member_id)}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="button primary" style={{ width: 'auto' }} onClick={() => respondToInvitation(row.regular_member_id, true)}>Accept</button>
              <button className="button secondary" style={{ width: 'auto' }} onClick={() => respondToInvitation(row.regular_member_id, false)}>Decline</button>
            </div>
          </div>
        )) : null}

        <div className="grid" style={{ gap: 8, marginTop: 14 }}>
          {members.map((member) => {
            const row = selectedAttendance.find((item) => item.regular_member_id === member.id);
            const substitute = row?.substitute_member_id ? membersById.get(row.substitute_member_id) : null;
            return <div className="notice" key={member.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <strong>{memberName(member.id)}</strong><span>{(row?.attendance_status || 'expected').replaceAll('_', ' ')}</span>
              </div>
              {substitute ? <div className="muted" style={{ marginTop: 4 }}>Actual player: {memberName(substitute.id)}{row?.organizer_confirmed_at ? ' • Organizer confirmed' : ''}</div> : null}
              {isOrganizer && !selectedSessionRow?.tournament_id ? <select
                className="input"
                value={row?.attendance_status || 'expected'}
                onChange={(event) => setOrganizerAttendance(member.id, event.target.value)}
                style={{ marginTop: 8 }}
              >
                <option value="expected">Expected</option><option value="playing">Playing</option>
                <option value="unsure">Unsure</option><option value="sub_needed">Sub needed</option>
                <option value="absent">Absent without substitute</option>
              </select> : null}
              {isOrganizer && row?.attendance_status === 'sub_needed' ? <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <select className="input" defaultValue="" onChange={(event) => event.target.value && inviteSubstitute(member.id, event.target.value)}>
                  <option value="">Choose approved substitute</option>
                  {substitutes.filter((item) => item.user_id).map((item) => <option key={item.id} value={item.id}>{memberName(item.id)}</option>)}
                </select>
              </div> : null}
              {isOrganizer && row?.attendance_status === 'sub_confirmed' && !row.organizer_confirmed_at ? <button className="button primary" style={{ width: 'auto', marginTop: 8 }} onClick={() => confirmSubstitute(member.id)}>Confirm Assignment</button> : null}
            </div>;
          })}
        </div>

        {isOrganizer ? <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="card-title" style={{ fontSize: 18 }}>Approved substitutes</div>
          <div className="grid two" style={{ gap: 8, marginTop: 10 }}>
            <input className="input" value={substituteName} onChange={(event) => setSubstituteName(event.target.value)} placeholder="Substitute name" />
            <input className="input" type="email" value={substituteEmail} onChange={(event) => setSubstituteEmail(event.target.value)} placeholder="DinkDraw account email" />
          </div>
          <button className="button secondary" type="button" style={{ marginTop: 8 }} disabled={!substituteEmail.trim()} onClick={addSubstitute}>Add Approved Substitute</button>
          {substitutes.length ? <div className="muted" style={{ marginTop: 8 }}>{substitutes.map((item) => memberName(item.id)).join(', ')}</div> : null}
        </div> : null}

        {selectedSessionPlayers.length ? <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="card-title" style={{ fontSize: 18 }}>Locked session participants</div>
          <div className="card-subtitle">Planned league positions versus the people recorded in the live tournament.</div>
          <div className="grid" style={{ gap: 8, marginTop: 10 }}>
            {selectedSessionPlayers.sort((a, b) => a.team_number - b.team_number).map((mapping) => (
              <div className="notice" key={mapping.regular_member_id}>
                Team {mapping.team_number}: <strong>{memberName(mapping.actual_member_id)}</strong>
                {mapping.actual_member_id !== mapping.regular_member_id ? <span className="muted"> substituting for {memberName(mapping.regular_member_id)}</span> : null}
              </div>
            ))}
          </div>
        </div> : null}
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Season sessions</div>
        <div className="grid" style={{ gap: 8, marginTop: 12 }}>
          {sessions.map((session) => (
            <div key={session.id} className="notice" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div><strong>Week {session.session_number}</strong> • {new Date(`${session.scheduled_date}T12:00:00`).toLocaleDateString()}</div>
              <span>{session.tournament_id ? 'Live tournament ready' : session.status === 'scheduled' ? 'Scheduled' : session.status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
