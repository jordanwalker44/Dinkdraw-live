'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { buildClubDemo, demoNames, newClubDemo, DEMO_FORMATS, DEMO_POSTSEASONS, type ClubDemo } from '../../../lib/club-demo';
import { OrganizationBrandBanner } from '../../../components/OrganizationBrandBanner';
import { TournamentBracket } from '../../../components/TournamentBracket';
import { PoolStandingsTables } from '../../../components/PoolStandingsTables';
import { ClubDemoStats } from '../../../components/ClubDemoStats';
import { DemoTvFrame } from '../../../components/DemoTvFrame';
import PublicTvDisplay from '../../../components/PublicTvDisplay';

export default function ClubDemoStudio() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');
  const [storageKey, setStorageKey] = useState('');
  const [saved, setSaved] = useState<ClubDemo[]>([]);
  const [demo, setDemo] = useState<ClubDemo | null>(null);
  const [message, setMessage] = useState('');
  const [logoMessage, setLogoMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<'public' | 'player' | 'standings' | 'tv' | 'join' | 'stats'>('public');
  const [joined, setJoined] = useState<{ demoId: string; playerId: string } | null>(null);
  const [joinName, setJoinName] = useState('');
  const [player, setPlayer] = useState('demo-player-0');
  const [clean, setClean] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [exporting, setExporting] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const logoRequest = useRef(0);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) { if (active) setAccess('denied'); return; }
        const { data, error } = await supabase.rpc('is_dinkdraw_admin');
        if (!active) return;
        if (error || data !== true) { setAccess('denied'); return; }
        const key = `dinkdraw-club-demos-v1:${auth.user.id}`;
        setStorageKey(key);
        try {
          const raw: unknown = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(raw)) setSaved(raw.filter(isDemo));
        } catch { setMessage('Saved demos could not be loaded. You can still create a new demo.'); }
        setDemo(newClubDemo());
        setAccess('allowed');
      } catch { if (active) setAccess('denied'); }
    }
    void check();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setAccess('denied'); setDemo(null); setSaved([]); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [supabase]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setClean(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const data = useMemo(() => demo ? buildClubDemo(demo) : null, [demo]);
  function change(patch: Partial<ClubDemo>) { setDemo(current => current ? { ...current, ...patch, gamesInRound: patch.step !== undefined ? 0 : patch.gamesInRound ?? current.gamesInRound } : current); setMessage('Unsaved changes.'); }
  function store(next: ClubDemo[]) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaved(next); return true; }
    catch { setMessage('Browser storage is full or unavailable. Try a smaller logo or remove an old saved demo.'); return false; }
  }
  async function upload(file: File | undefined) {
    if (!file || !demo) return;
    const targetId = demo.id;
    const request = ++logoRequest.current;
    setLogoMessage('');
    if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name) && !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type)) {
      setLogoMessage('Choose a PNG, JPG, WEBP, GIF, or SVG image. HEIC files must be exported as PNG or JPG first.'); return;
    }
    if (file.size > 10 * 1024 * 1024) { setLogoMessage('Choose a logo under 10 MB.'); return; }
    setUploading(true);
    setLogoMessage('Loading logo…');
    try {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read this file.'));
        reader.onabort = () => reject(new Error('File reading was cancelled.'));
        reader.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const timeout = window.setTimeout(() => reject(new Error('Image loading timed out.')), 15000);
        image.onload = () => { clearTimeout(timeout); resolve(image); };
        image.onerror = () => { clearTimeout(timeout); reject(new Error('Unsupported or damaged image.')); };
        image.src = source;
      });
      const width = img.naturalWidth || img.width || 512;
      const height = img.naturalHeight || img.height || 512;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 512 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable in this browser.');
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const logo = canvas.toDataURL('image/png');
      if (logoRequest.current === request) {
        setDemo(current => current?.id === targetId ? { ...current, logo } : current);
        setLogoMessage(`${file.name} loaded. Click Save demo to keep it.`);
        setMessage('Logo ready. Save demo to keep it.');
      }
    } catch {
      if (logoRequest.current === request) setLogoMessage('This image could not be opened. Try exporting it as PNG or JPG, then choose it again.');
    } finally { setUploading(false); }
  }

  async function download() {
    if (!preview.current || !demo) return;
    setExporting(true); setMessage('');
    try {
      const { toPng } = await import('html-to-image');
      const url = await toPng(preview.current, { pixelRatio: 2, backgroundColor: '#001426' });
      const a = document.createElement('a'); a.href = url; a.download = `${demo.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${view}.png`; a.click();
      setMessage('Screenshot downloaded.');
    } catch { setMessage('Could not export this view. Use screenshot mode and your device’s screenshot controls.'); }
    finally { setExporting(false); }
  }
  if (access === 'loading') return <main className="page-shell"><div className="card">Checking admin access…</div></main>;
  if (access === 'denied') return <main className="page-shell"><div className="card"><h1>Club Demo Studio</h1><p>Sign in with a DinkDraw administrator account to create club demos.</p><Link className="button primary" href="/account?redirect=%2Fadmin%2Fdemo">Go to account</Link></div></main>;
  if (!demo || !data) return null;
  const brand = { name: demo.name, logo_url: demo.logo, primary_color: demo.primary, accent_color: demo.accent };
  const byId = Object.fromEntries(data.players.map(p => [p.id, p]));
  const team = (a: string | null, b: string | null) => [a, b].filter(Boolean).map(id => byId[id!]?.display_name || 'TBD').join(' & ') || 'TBD';
  const selectedPlayer = byId[player] ? player : data.players[0].id;
  const joinedHere = joined?.demoId === demo.id && joined.playerId === selectedPlayer;
  const complete = demo.step >= data.maxStep;
  const tournament = { title: demo.title, courts: data.courts, court_labels: null, rounds: data.isLeague ? 12 : data.isCream ? 9 : 3, status: complete ? 'completed' : demo.step || demo.gamesInRound ? 'started' : 'draft', pool_brackets_enabled: data.isPool, pool_postseason_format: demo.postseason || 'split' };
  const currentRound = Math.min(demo.step + 1, data.maxStep);
  const shownMatches = demo.step >= 3 && data.isPool ? data.playoffs.map((m, i) => ({ ...m, court_number: i % tournament.courts + 1 })) : data.matches;
  return <main className="page-shell" style={{ maxWidth: view === 'tv' ? 1600 : 1200 }}>
    {!clean && <section className="card">
      <Link href="/admin/features">← Admin tools</Link>
      <h1>Club Demo Studio</h1><p>Create a personalized event with fictional players. Saved demos stay in this browser on this device. Click Save demo to keep your changes.</p>
      <div className="demo-controls">
        <label>Saved demos<select className="input" value={saved.some(s => s.id === demo.id) ? demo.id : ''} onChange={e => { const selected = saved.find(s => s.id === e.target.value); if (selected) { ++logoRequest.current; setDemo(selected); setMessage('Saved demo opened.'); } }}><option value="" disabled>New, unsaved demo</option>{saved.map(s => <option key={s.id} value={s.id}>{s.name} — {s.title}</option>)}</select></label>
        <button className="button secondary" onClick={() => { ++logoRequest.current; setDemo(newClubDemo()); setMessage('New demo ready.'); }}>New demo</button>
        <button className="button primary" disabled={uploading} onClick={() => { if (!demo.name.trim() || !demo.title.trim() || demo.names.some(n => !n.trim())) { setMessage('Enter a club name, event title, and a name for every player.'); return; } if (store([...saved.filter(s => s.id !== demo.id), demo])) setMessage('Demo saved in this browser.'); }}>Save demo</button>
        <button className="button secondary" onClick={() => { ++logoRequest.current; setDemo({ ...demo, id: crypto.randomUUID(), name: `${demo.name} copy` }); setMessage('Copy created. Edit the branding and save it.'); }}>Duplicate</button>
        <button className="button secondary" disabled={!saved.some(s => s.id === demo.id)} onClick={() => { if (window.confirm(`Delete the saved demo for ${demo.name}?`) && store(saved.filter(s => s.id !== demo.id))) { setDemo(newClubDemo()); setMessage('Saved demo deleted.'); } }}>Delete saved demo</button>
      </div>
      <div className="demo-fields">
        <label>Club name<input className="input" maxLength={100} value={demo.name} onChange={e => change({ name: e.target.value })} /></label>
        <label>Event title<input className="input" maxLength={140} value={demo.title} onChange={e => change({ title: e.target.value })} /></label>
        <div><label>Club logo<input className="input" type="file" disabled={uploading} accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void upload(file); }} /></label><small>PNG, JPG, WEBP, GIF, or SVG · up to 10 MB</small>{logoMessage && <p role="status">{logoMessage}</p>}{demo.logo && <img src={demo.logo} alt="Selected club logo" style={{ width: 80, height: 80, objectFit: 'contain', background: '#fff', borderRadius: 8, marginTop: 8 }} />}</div>
        <div className="demo-controls"><label>Primary<input aria-label="Primary color" type="color" value={demo.primary} onChange={e => change({ primary: e.target.value })} /></label><label>Accent<input aria-label="Accent color" type="color" value={demo.accent} onChange={e => change({ accent: e.target.value })} /></label>{demo.logo && <button className="button secondary" onClick={() => { ++logoRequest.current; change({ logo: null }); }}>Remove logo</button>}</div>
        <label>Tournament type<select className="input" value={demo.format} onChange={e => change({ format: e.target.value as ClubDemo['format'], playStyle: 'rotating', step: 0 })}>{Object.entries(DEMO_FORMATS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {!data.isCream && !data.isLeague && <label>Play style<select className="input" value={demo.playStyle || 'rotating'} onChange={e => change({ playStyle: e.target.value as ClubDemo['playStyle'], step: 0 })}><option value="rotating">Rotating doubles</option><option value="mixed">Mixed doubles</option>{!data.isPool && <><option value="fixed">Fixed partners</option><option value="singles">Singles</option></>}</select></label>}
        {data.isPool && <label>Postseason structure<select className="input" value={demo.postseason || 'split'} onChange={e => change({ postseason: e.target.value as ClubDemo['postseason'], step: 0 })}>{Object.entries(DEMO_POSTSEASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {data.isLeague && <p>Four sample weeks with rotating partners and cumulative standings. Each week has three rounds.</p>}
        {data.isCream && <p>Three stages of rotating doubles. Players move courts after each stage using the real Cream of the Crop scheduler.</p>}
        {demo.format === 'moneyball' && <p>Sample Moneyball event with fictional prizes and a race-to-three series preview. No payments are collected.</p>}
        <label>Players / courts<select className="input" value={demo.names.length} onChange={e => { const count = Number(e.target.value); const defaults = demoNames(count, demo.seed); change({ names: defaults.map((name, i) => demo.names[i] || name), step: 0 }); }} >{[8, 16, 32].map(n => <option key={n} value={n}>{n} players · {n / (data.isSingles ? 2 : 4)} courts</option>)}</select></label>
      </div>
      <details><summary>Edit prepopulated players</summary><p>Names are fictional. Schedules and sample results follow the selected tournament type and play style.</p><button className="button secondary" onClick={() => change({ names: demoNames(demo.names.length, demo.seed + 1), seed: demo.seed + 1, step: 0 })}>Shuffle names</button><div className="demo-fields">{demo.names.map((name, i) => <label key={i}>Player {i + 1}<input className="input" maxLength={60} value={name} onChange={e => change({ names: demo.names.map((n, j) => i === j ? e.target.value : n) })} /></label>)}</div></details>
      <hr /><div className="demo-controls"><button className="button secondary" disabled={demo.step === 0 && !demo.gamesInRound} onClick={() => change({ step: 0 })}>Reset event</button><button className="button secondary" disabled={demo.step === 0} onClick={() => change({ step: demo.step - 1 })}>Previous round</button><button className="button primary" disabled={complete || !data.roundGames.length} onClick={() => { const next = (demo.gamesInRound || 0) + 1; change(next >= data.roundGames.length ? { step: demo.step + 1 } : { gamesInRound: next }); }}>Simulate next game</button><button className="button secondary" disabled={complete} onClick={() => change({ step: demo.step + 1 })}>Finish current round</button><button className="button secondary" disabled={complete} onClick={() => change({ step: data.maxStep })}>Complete tournament</button><span>{demo.step} / {data.maxStep} rounds completed{!complete && ` · ${demo.gamesInRound || 0}/${data.roundGames.length} games finished in this round`}</span></div>
      <div className="demo-controls" style={{ marginTop: 16 }}><label>Preview<select className="input" value={view} onChange={e => setView(e.target.value as typeof view)}><option value="public">Public brackets & matches</option><option value="player">Player match preview</option><option value="standings">Standings</option><option value="tv">TV display</option><option value="join">Simulate player joining</option><option value="stats">My Stats preview</option></select></label>{(view === 'player' || view === 'stats') && <label>Player<select className="input" value={selectedPlayer} onChange={e => setPlayer(e.target.value)}>{data.players.map(p => <option value={p.id} key={p.id}>{p.display_name}</option>)}</select></label>}<label><input type="checkbox" checked={mobile} onChange={e => setMobile(e.target.checked)} /> Phone width</label><button className="button secondary" onClick={() => setClean(true)}>Screenshot mode</button><button className="button primary" disabled={exporting || uploading} onClick={() => void download()}>{exporting ? 'Exporting…' : 'Download PNG'}</button></div>
      <div className="demo-controls" style={{ marginTop: 12 }}><button className="button secondary" onClick={() => { setJoined(null); setJoinName(''); setView('join'); }}>Simulate player joining</button><button className="button secondary" onClick={() => { setJoined(null); setJoinName(''); setView('public'); }}>Reset join demo</button></div>
      <p><small>Joining and player history are simulated; real events retain their normal account requirements. No signup or authentication is performed.</small></p>
      <p><small>Demo only · No live events, player statistics, prizes, or notifications are created. Brackets appear after pool round 3 for bracket events. Preview uses DinkDraw’s shared branding, brackets, standings, and TV components; the player panel is a demo match preview.</small></p>
      {message && <div role="status" className="notice">{message}</div>}
    </section>}
    {clean && <button className="button secondary demo-exit" onClick={() => setClean(false)}>Exit screenshot mode · Esc</button>}
    <div ref={preview} style={{ width: mobile ? 390 : '100%', maxWidth: '100%', margin: '0 auto', padding: view === 'tv' ? 0 : 16, background: '#001426', borderRadius: 16 }}>
      {view === 'tv' ? <DemoTvFrame><PublicTvDisplay previewWidth={1600} tournament={tournament} playerSlots={data.players} matches={data.matches} standings={data.standings} currentRound={currentRound} isSingles={data.isSingles} tournamentMode={data.isCream ? 'cream_of_the_crop' : 'round_robin'} isLive={!complete} organizationBrand={brand} poolStandings={data.isPool ? data.pools : []} playoffMatches={data.playoffs} /></DemoTvFrame> : <>
        <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 16 }}>DinkDraw</div><OrganizationBrandBanner brand={brand} />
        <section className="card"><div className="card-title">{demo.title}</div><p>{DEMO_FORMATS[demo.format]} · {complete ? 'Tournament complete' : demo.step === 0 && !demo.gamesInRound ? 'Ready to play' : `Live · Round ${currentRound}`} · {demo.names.length} players · {tournament.courts} courts</p></section>
        {view === 'public' && <section className="card"><button className="button primary" onClick={() => { setJoinName(''); setView('join'); }}>Join Now</button><p className="muted">Try joining this sample event.</p></section>}
        {(view === 'player' || view === 'stats') && <section className="card">{joinedHere && <p role="status">You’re in, {byId[selectedPlayer].display_name}! Your demo player spot is ready.</p>}<div className="demo-controls"><button className={`button ${view === 'player' ? 'primary' : 'secondary'}`} onClick={() => setView('player')}>My matches</button><button className={`button ${view === 'stats' ? 'primary' : 'secondary'}`} onClick={() => setView('stats')}>My Stats</button></div></section>}
        {demo.format === 'moneyball' && <section className="card"><div className="card-title">Moneyball Series · Race to 3</div><p>Sample buy-in: $20 per player · Event prize: ${demo.names.length * 10} · Series contribution: ${demo.names.length * 10}</p><p>{complete ? 'Event finished · Series win awarded to the championship team' : 'Opening event · First team to three event wins takes the series'}</p><small>Illustrative prizes only</small></section>}
        {view === 'join' ? <section className="card"><div className="card-title">Join {demo.title}</div><p>Choose a sample player spot. You can use their name or enter a name for this demonstration.</p><form onSubmit={e => { e.preventDefault(); const name = joinName.trim(); if (name) change({ names: demo.names.map((n, i) => `demo-player-${i}` === selectedPlayer ? name : n) }); setJoined({ demoId: demo.id, playerId: selectedPlayer }); setView('player'); }}><label>Player spot<select className="input" value={selectedPlayer} onChange={e => { setPlayer(e.target.value); setJoinName(''); }}>{data.players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label><label style={{ marginTop: 12 }}>Your demo name (optional)<input className="input" maxLength={60} value={joinName} placeholder={byId[selectedPlayer].display_name} onChange={e => setJoinName(e.target.value)} /></label><button className="button primary" type="submit" style={{ marginTop: 16 }}>Join Now</button></form><p className="muted">Demo only · Account step skipped · No real registration</p></section> : view === 'stats' ? <ClubDemoStats key={`${demo.id}-${selectedPlayer}`} demo={demo} playerId={selectedPlayer} /> : view === 'standings' ? (data.isPool ? <PoolStandingsTables pools={data.pools} /> : <section className="card"><div className="card-title">Standings</div>{data.standings.map((p, i) => <div className="list-item row-between" key={p.playerId} style={{ padding: 12 }}><span>#{i + 1} {p.name}{data.isCream && p.finalCourt ? ` · Court ${p.finalCourt}` : ''}</span><strong>{p.wins}–{p.losses} · {p.pointDiff > 0 ? '+' : ''}{p.pointDiff}</strong></div>)}</section>) : <>
          {view === 'public' && data.playoffs.length > 0 && <section className="card"><div className="card-title">Bracket Path</div><div className="card-subtitle">Follow every team from its opening matchup to the championship.</div>{data.playoffs.some(m => m.elimination_section) ? (['main', 'second_chance', 'last_chance', 'finals'] as const).map(section => <TournamentBracket key={section} matches={data.playoffs} players={byId} bracketType={section === 'main' || section === 'finals' ? 'championship' : 'consolation'} eliminationSection={section} title={{ main: 'Main Draw', second_chance: 'Second Chance', last_chance: 'Last Chance', finals: 'Championship Finals' }[section]} accentColor={section === 'main' || section === 'finals' ? demo.accent : '#A78BFA'} />) : <><TournamentBracket matches={data.playoffs} players={byId} bracketType="championship" title="Championship Bracket" accentColor={demo.accent} /><TournamentBracket matches={data.playoffs} players={byId} bracketType="consolation" title="Consolation Bracket" accentColor="#A78BFA" /></>}</section>}
          <section className="card"><div className="card-title">{view === 'player' ? `${byId[selectedPlayer]?.display_name || 'Player'} · My matches` : 'Matches'}</div><div style={{ display: 'grid', gap: 12, marginTop: 12 }}>{shownMatches.filter(m => view !== 'player' || [m.team_a_player_1_id, m.team_a_player_2_id, m.team_b_player_1_id, m.team_b_player_2_id].includes(selectedPlayer)).map(m => <div className="list-item" key={m.id} style={{ padding: 14 }}><div style={{ color: demo.accent, marginBottom: 8, fontWeight: 800 }}>{data.isLeague ? `Week ${Math.ceil(m.round_number / 3)} · Round ${(m.round_number - 1) % 3 + 1}` : `Round ${m.round_number}`} · Court {m.court_number} · {m.is_complete ? 'Final' : 'Upcoming'}</div><div className="row-between"><span>{team(m.team_a_player_1_id, m.team_a_player_2_id)}</span><strong>{m.team_a_score ?? '—'}</strong></div><div className="row-between"><span>{team(m.team_b_player_1_id, m.team_b_player_2_id)}</span><strong>{m.team_b_score ?? '—'}</strong></div></div>)}</div></section>
        </>}
      </>}
    </div>
    <style jsx>{`.demo-controls { display:flex; flex-wrap:wrap; align-items:center; gap:10px; } .demo-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:16px; margin:20px 0; } label { display:grid; gap:6px; } summary { cursor:pointer; padding:12px 0; font-weight:800; } .demo-exit { position:fixed; bottom:12px; right:12px; z-index:10000; opacity:0.25; } .demo-exit:hover,.demo-exit:focus { opacity:1; }`}</style>
  </main>;
}

function isDemo(value: unknown): value is ClubDemo {
  if (!value || typeof value !== 'object') return false;
  const d = value as ClubDemo;
  return typeof d.id === 'string' && typeof d.name === 'string' && typeof d.title === 'string'
    && (d.logo === null || typeof d.logo === 'string' && d.logo.startsWith('data:image/png;base64,'))
    && /^#[0-9a-f]{6}$/i.test(d.primary) && /^#[0-9a-f]{6}$/i.test(d.accent)
    && Array.isArray(d.names) && [8, 16, 32].includes(d.names.length) && d.names.every(n => typeof n === 'string')
    && Object.keys(DEMO_FORMATS).includes(d.format)
    && (d.postseason === undefined || Object.keys(DEMO_POSTSEASONS).includes(d.postseason))
    && (d.playStyle === undefined || ['rotating', 'fixed', 'mixed', 'singles'].includes(d.playStyle)) && Number.isInteger(d.step) && d.step >= 0
    && d.step <= 100
    && (d.gamesInRound === undefined || Number.isInteger(d.gamesInRound) && d.gamesInRound >= 0 && d.gamesInRound <= 32)
    && Number.isSafeInteger(d.seed) && d.seed >= 0;
}
