'use client';

import { useMemo, useState } from 'react';
import { type ClubDemo } from '../lib/club-demo';
import { buildClubDemoStats } from '../lib/club-demo-stats';

export function ClubDemoStats({ demo, playerId }: { demo: ClubDemo; playerId: string }) {
  const [history, setHistory] = useState(true);
  const stats = useMemo(() => buildClubDemoStats(demo, playerId, history), [demo, playerId, history]);
  const name = demo.names[Number(playerId.replace('demo-player-', ''))] || 'Player';
  const card = (label: string, value: string | number, sub?: string) => <div key={label} style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}><div className="muted">{label}</div><div style={{ fontSize: 28, fontWeight: 900, color: demo.accent }}>{value}</div>{sub && <small>{sub}</small>}</div>;
  return <>
    <section className="card"><div className="card-title">{name} · My Stats</div><p>Fictional player profile · Stats update as demo rounds finish.</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className={`button ${history ? 'primary' : 'secondary'}`} onClick={() => setHistory(true)}>Career + sample history</button><button className={`button ${history ? 'secondary' : 'primary'}`} onClick={() => setHistory(false)}>This event</button></div></section>
    <section className="card"><div className="card-title">Game Performance</div><div className="two-col">{card('Game Win Rate', `${stats.winRate}%`, `${stats.matches.length} completed games`)}{card('Game Wins', stats.wins, `${stats.losses} losses`)}{card('Points For', stats.pointsFor, `${stats.pointsAgainst} against`)}{card('Point Diff', `${stats.pointDiff > 0 ? '+' : ''}${stats.pointDiff}`)}</div></section>
    <section className="card"><div className="card-title">Achievements & Form</div><div className="two-col">{card('Best Finish', stats.bestFinish === null ? '—' : `#${stats.bestFinish}`)}{card('Podiums', stats.podiums, 'Top 3 finishes')}{card('Tournament Wins', stats.tournamentWins)}{card('Best Win Streak', stats.bestWinStreak)}{card('Current Streak', stats.streak)}{card('Events Played', stats.events.filter(e => e.matches.length).length)}</div><p>Recent form: {stats.matches.slice(-10).map(m => <span key={m.id} style={{ display: 'inline-block', padding: '4px 8px', margin: 3, borderRadius: 6, background: m.win ? '#166534' : '#7f1d1d' }}>{m.win ? 'W' : 'L'}</span>)}</p></section>
    <section className="card"><div className="card-title">Partnership Performance</div>{stats.partners.length ? stats.partners.slice(0, 5).map(p => <div className="list-item row-between" style={{ padding: 12 }} key={p.id}><strong>{p.name}</strong><span>{p.winRate}% · {p.wins}–{p.losses} · {p.played} matches</span></div>) : <p>No completed doubles matches yet.</p>}</section>
    <section className="card"><div className="card-title">Tournament Results</div>{[...stats.events].reverse().map(e => <div className="list-item" style={{ padding: 12 }} key={e.id}><strong>{e.title}</strong><div className="muted">{e.label} · {e.completed ? 'Completed' : 'In progress'}{e.placement ? ` · #${e.placement}` : ''}</div><div>{e.matches.filter(m => m.win).length} wins · {e.matches.filter(m => !m.win).length} losses</div></div>)}</section>
    <section className="card"><div className="card-title">Recent Matches</div>{[...stats.matches].reverse().slice(0, 12).map(m => <div className="list-item" style={{ padding: 12 }} key={m.id}><strong style={{ color: m.win ? '#86EFAC' : '#FDA4AF' }}>{m.win ? 'Win' : 'Loss'} · {m.pointsFor}–{m.pointsAgainst}</strong><div>{m.partner ? `With ${m.partner} · ` : ''}vs. {m.opponents}</div><small>{m.title} · Round {m.round}</small></div>)}{!stats.matches.length && <p>Complete a demo round to see your first result.</p>}</section>
  </>;
}
