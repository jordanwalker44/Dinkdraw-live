'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TopNav } from '../../components/TopNav';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';

type EntryType = 'drill' | 'play';
type DraftEntry = { id: string; entryType: EntryType; minutes: string; focusArea: string; customName: string; playType: string; playFormat: string };
type SavedEntry = { id: string; entry_type: EntryType; duration_minutes: number; focus_area: string | null; custom_name: string | null; play_type: string | null; play_format: string | null };
type Session = { id: string; activity_date: string; notes: string | null; source: 'manual' | 'dinkdraw_tournament'; tournament_id: string | null; training_entries: SavedEntry[] };
type Goal = { goal_type: 'total_minutes' | 'drill_minutes' | 'play_minutes' | 'active_days'; target: number };
type Tournament = { id: string; title: string; event_date: string | null; format: string };

const FOCUS_AREAS = ['Serves', 'Returns', 'Drops', 'Drives', 'Resets', 'Dinks', 'Volleys', 'Speedups & counters', 'Defense', 'Footwork', 'Strategy', 'Conditioning', 'Other'];
const PLAY_TYPES = ['Open play', 'Practice games', 'Tournament', 'League', 'Ladder', 'Club event', 'Lesson / coached play', 'Other'];
const PLAY_FORMATS = ['Doubles', 'Singles', 'Mixed doubles', 'Skinny singles', 'Other'];

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}
function makeEntry(type: EntryType, values: Partial<DraftEntry> = {}): DraftEntry {
  return { id: crypto.randomUUID(), entryType: type, minutes: '', focusArea: 'Drops', customName: '', playType: 'Open play', playFormat: 'Doubles', ...values };
}
function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60); const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function weekStart(date = new Date()) {
  const result = new Date(date); const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); result.setHours(0, 0, 0, 0);
  return result;
}

export default function TrainingPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pendingTournaments, setPendingTournaments] = useState<Tournament[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(localDateValue());
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<DraftEntry[]>([makeEntry('drill')]);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [goalType, setGoalType] = useState<Goal['goal_type']>('total_minutes');
  const [goalTarget, setGoalTarget] = useState('180');

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getSession();
    const user = authData.session?.user;
    if (!user) { setUserId(''); setLoading(false); return; }
    setUserId(user.id);
    const [sessionsResult, goalResult, playerResult, dismissalResult] = await Promise.all([
      supabase.from('training_sessions').select('id, activity_date, notes, source, tournament_id, training_entries(id, entry_type, duration_minutes, focus_area, custom_name, play_type, play_format)').eq('user_id', user.id).order('activity_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('training_goals').select('goal_type, target').eq('user_id', user.id).maybeSingle(),
      supabase.from('tournament_players').select('tournament_id').eq('claimed_by_user_id', user.id),
      supabase.from('training_tournament_dismissals').select('tournament_id').eq('user_id', user.id),
    ]);
    if (sessionsResult.error) setMessage(sessionsResult.error.message);
    const loadedSessions = (sessionsResult.data || []) as Session[];
    setSessions(loadedSessions);
    const loadedGoal = goalResult.data as Goal | null;
    setGoal(loadedGoal); if (loadedGoal) { setGoalType(loadedGoal.goal_type); setGoalTarget(String(loadedGoal.target)); }
    const tournamentIds = Array.from(new Set((playerResult.data || []).map((row) => row.tournament_id)));
    const ignored = new Set([...(dismissalResult.data || []).map((row) => row.tournament_id), ...loadedSessions.map((row) => row.tournament_id).filter(Boolean)]);
    if (tournamentIds.length) {
      const { data } = await supabase.from('tournaments').select('id, title, event_date, format').in('id', tournamentIds).eq('status', 'completed').order('event_date', { ascending: false });
      setPendingTournaments(((data || []) as Tournament[]).filter((row) => !ignored.has(row.id)));
    } else setPendingTournaments([]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    const start = weekStart(); const end = new Date(start); end.setDate(end.getDate() + 7);
    const weekSessions = sessions.filter((session) => { const d = new Date(`${session.activity_date}T12:00:00`); return d >= start && d < end; });
    const all = weekSessions.flatMap((session) => session.training_entries || []);
    const drill = all.filter((entry) => entry.entry_type === 'drill').reduce((sum, entry) => sum + entry.duration_minutes, 0);
    const play = all.filter((entry) => entry.entry_type === 'play').reduce((sum, entry) => sum + entry.duration_minutes, 0);
    return { drill, play, total: drill + play, days: new Set(weekSessions.map((session) => session.activity_date)).size };
  }, [sessions]);

  const goalProgress = goal ? (goal.goal_type === 'drill_minutes' ? totals.drill : goal.goal_type === 'play_minutes' ? totals.play : goal.goal_type === 'active_days' ? totals.days : totals.total) : 0;
  const goalPercent = goal ? Math.min(100, Math.round((goalProgress / goal.target) * 100)) : 0;

  function resetForm() { setEditingId(null); setDate(localDateValue()); setNotes(''); setEntries([makeEntry('drill')]); setTournamentId(null); setShowForm(false); }
  function updateEntry(id: string, values: Partial<DraftEntry>) { setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...values } : entry)); }
  function beginTournament(tournament: Tournament) { setEditingId(null); setDate(tournament.event_date || localDateValue()); setNotes(tournament.title); setEntries([makeEntry('play', { playType: 'Tournament', playFormat: tournament.format === 'singles' ? 'Singles' : 'Doubles' })]); setTournamentId(tournament.id); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function editSession(session: Session) {
    setEditingId(session.id); setDate(session.activity_date); setNotes(session.notes || ''); setTournamentId(session.tournament_id);
    setEntries(session.training_entries.map((entry) => makeEntry(entry.entry_type, { minutes: String(entry.duration_minutes), focusArea: entry.focus_area || 'Other', customName: entry.custom_name || '', playType: entry.play_type || 'Other', playFormat: entry.play_format || 'Other' })));
    setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveSession() {
    setMessage('');
    const validEntries = entries.filter((entry) => Number(entry.minutes) > 0);
    if (!userId || !date || validEntries.length === 0) { setMessage('Add a date and at least one entry with time.'); return; }
    setSaving(true);
    let sessionId = editingId;
    if (editingId) {
      const { error } = await supabase.from('training_sessions').update({ activity_date: date, notes: notes.trim() || null, updated_at: new Date().toISOString() }).eq('id', editingId);
      if (!error) await supabase.from('training_entries').delete().eq('session_id', editingId);
      if (error) { setMessage(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('training_sessions').insert({ user_id: userId, activity_date: date, notes: notes.trim() || null, source: tournamentId ? 'dinkdraw_tournament' : 'manual', tournament_id: tournamentId }).select('id').single();
      if (error) { setMessage(error.message); setSaving(false); return; }
      sessionId = data.id;
    }
    const rows = validEntries.map((entry) => ({ session_id: sessionId, user_id: userId, entry_type: entry.entryType, duration_minutes: Number(entry.minutes), focus_area: entry.entryType === 'drill' ? entry.focusArea : null, custom_name: entry.entryType === 'drill' ? entry.customName.trim() || null : null, play_type: entry.entryType === 'play' ? entry.playType : null, play_format: entry.entryType === 'play' ? entry.playFormat : null }));
    const { error } = await supabase.from('training_entries').insert(rows);
    if (error) setMessage(error.message); else { resetForm(); setMessage('Activity saved.'); await load(); }
    setSaving(false);
  }

  async function deleteSession(id: string) { if (!window.confirm('Delete this activity?')) return; await supabase.from('training_sessions').delete().eq('id', id); await load(); }
  async function dismissTournament(id: string) { await supabase.from('training_tournament_dismissals').insert({ user_id: userId, tournament_id: id }); setPendingTournaments((current) => current.filter((row) => row.id !== id)); }
  async function saveGoal() {
    const target = Number(goalTarget); if (!userId || target <= 0) { setMessage('Enter a goal greater than zero.'); return; }
    const { error } = await supabase.from('training_goals').upsert({ user_id: userId, goal_type: goalType, target, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) setMessage(error.message); else { setGoal({ goal_type: goalType, target }); setMessage('Weekly goal saved.'); }
  }

  if (loading) return <main className="page-shell"><TopNav /><div className="card">Loading your training…</div></main>;
  if (!userId) return <main className="page-shell"><TopNav /><div className="card"><div className="card-title">Training</div><div className="card-subtitle">Sign in to track your drilling and play.</div><Link className="button primary" href="/account?redirect=/training">Sign In</Link></div></main>;

  return <main className="page-shell training-page"><TopNav />
    <div className="training-heading"><div><div className="eyebrow">PLAYER DEVELOPMENT</div><h1>Training</h1><p>Track the work behind your game.</p></div><button className="button primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Log activity</button></div>
    {message ? <div className="notice training-notice">{message}</div> : null}

    {showForm ? <div className="card training-form-card">
      <div className="row-between"><div><div className="card-title">{editingId ? 'Edit activity' : tournamentId ? 'Add tournament play' : 'Log activity'}</div><div className="card-subtitle">Add as many drill and play entries as you need.</div></div><button className="icon-button" aria-label="Close" onClick={resetForm}>×</button></div>
      <label className="label">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="training-entry-list">{entries.map((entry, index) => <div className={`training-entry ${entry.entryType}`} key={entry.id}>
        <div className="row-between"><strong>{entry.entryType === 'drill' ? 'Drill' : 'Play'} {entries.length > 1 ? index + 1 : ''}</strong><button className="text-button danger" onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))}>Remove</button></div>
        <div className="training-segmented"><button className={entry.entryType === 'drill' ? 'active' : ''} onClick={() => updateEntry(entry.id, { entryType: 'drill' })}>Drilling</button><button className={entry.entryType === 'play' ? 'active' : ''} onClick={() => updateEntry(entry.id, { entryType: 'play' })}>Playing</button></div>
        {entry.entryType === 'drill' ? <div className="grid"><div><label className="label">Focus area</label><select className="input" value={entry.focusArea} onChange={(e) => updateEntry(entry.id, { focusArea: e.target.value })}>{FOCUS_AREAS.map((area) => <option key={area}>{area}</option>)}</select></div><div><label className="label">Specific drill (optional)</label><input className="input" value={entry.customName} onChange={(e) => updateEntry(entry.id, { customName: e.target.value })} placeholder="Crosscourt third-shot drops" /></div></div> : <div className="two-col"><div><label className="label">Play kind</label><select className="input" value={entry.playType} onChange={(e) => updateEntry(entry.id, { playType: e.target.value })}>{PLAY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div><div><label className="label">Format</label><select className="input" value={entry.playFormat} onChange={(e) => updateEntry(entry.id, { playFormat: e.target.value })}>{PLAY_FORMATS.map((format) => <option key={format}>{format}</option>)}</select></div></div>}
        <label className="label">Time spent (minutes)</label><input className="input" type="number" min="1" max="1440" inputMode="numeric" value={entry.minutes} onChange={(e) => updateEntry(entry.id, { minutes: e.target.value })} placeholder="45" />
      </div>)}</div>
      <div className="two-col"><button className="button secondary" onClick={() => setEntries((current) => [...current, makeEntry('drill')])}>+ Add drill</button><button className="button secondary" onClick={() => setEntries((current) => [...current, makeEntry('play')])}>+ Add play</button></div>
      <label className="label training-notes-label">Session notes (optional)</label><textarea className="input training-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What clicked? What should you work on next?" />
      <button className="button primary training-save" disabled={saving} onClick={saveSession}>{saving ? 'Saving…' : 'Save activity'}</button>
    </div> : null}

    <section className="training-summary-grid"><div className="card training-total"><span>This week</span><strong>{formatMinutes(totals.total)}</strong><small>{totals.days} active {totals.days === 1 ? 'day' : 'days'}</small></div><div className="card"><span className="summary-label drill-dot">Drilling</span><strong className="summary-number">{formatMinutes(totals.drill)}</strong></div><div className="card"><span className="summary-label play-dot">Playing</span><strong className="summary-number">{formatMinutes(totals.play)}</strong></div></section>

    <div className="card"><div className="row-between"><div><div className="card-title">Weekly goal</div><div className="card-subtitle">Build consistency without punishing rest days.</div></div>{goal ? <strong>{goalPercent}%</strong> : null}</div>
      {goal ? <><div className="goal-progress"><span style={{ width: `${goalPercent}%` }} /></div><div className="muted goal-copy">{goalProgress} of {goal.target} {goal.goal_type === 'active_days' ? 'days' : 'minutes'}</div></> : null}
      <div className="goal-controls"><select className="input" value={goalType} onChange={(e) => setGoalType(e.target.value as Goal['goal_type'])}><option value="total_minutes">Total activity minutes</option><option value="drill_minutes">Drilling minutes</option><option value="play_minutes">Playing minutes</option><option value="active_days">Active days</option></select><input className="input" type="number" min="1" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} /><button className="button secondary" onClick={saveGoal}>{goal ? 'Update' : 'Set goal'}</button></div>
    </div>

    {pendingTournaments.length ? <div className="card"><div className="card-title">Needs your input</div><div className="card-subtitle">Add the time you actually played—not the tournament’s total duration.</div>{pendingTournaments.map((tournament) => <div className="tournament-reminder" key={tournament.id}><div><strong>{tournament.title}</strong><div className="muted">{tournament.event_date ? displayDate(tournament.event_date) : 'Completed tournament'}</div></div><div className="row"><button className="button primary compact" onClick={() => beginTournament(tournament)}>Enter time</button><button className="text-button" onClick={() => dismissTournament(tournament.id)}>Dismiss</button></div></div>)}</div> : null}

    <div className="card"><div className="card-title">Activity history</div><div className="card-subtitle">Your drilling and play stay private to your account.</div>
      {!sessions.length ? <div className="training-empty"><strong>No activity yet</strong><span>Log your first drill or play session to start your history.</span><button className="button primary" onClick={() => setShowForm(true)}>Log first activity</button></div> : <div className="training-history">{sessions.map((session) => { const drill = session.training_entries.filter((e) => e.entry_type === 'drill').reduce((s, e) => s + e.duration_minutes, 0); const play = session.training_entries.filter((e) => e.entry_type === 'play').reduce((s, e) => s + e.duration_minutes, 0); return <article className="training-history-item" key={session.id}><div className="row-between"><div><strong>{displayDate(session.activity_date)}</strong>{session.source === 'dinkdraw_tournament' ? <span className="tag green training-source">DinkDraw tournament</span> : null}</div><strong>{formatMinutes(drill + play)}</strong></div><div className="training-entry-chips">{session.training_entries.map((entry) => <span key={entry.id} className={entry.entry_type}>{entry.entry_type === 'drill' ? entry.custom_name || entry.focus_area : `${entry.play_type}${entry.play_format ? ` · ${entry.play_format}` : ''}`} · {formatMinutes(entry.duration_minutes)}</span>)}</div>{session.notes ? <p className="training-session-note">{session.notes}</p> : null}<div className="row"><button className="text-button" onClick={() => editSession(session)}>Edit</button><button className="text-button danger" onClick={() => deleteSession(session.id)}>Delete</button></div></article>; })}</div>}
    </div>
  </main>;
}
