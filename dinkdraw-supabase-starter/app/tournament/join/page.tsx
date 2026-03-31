'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { TopNav } from '@/components/TopNav';

export default function JoinTournamentPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  async function handleJoin() {
    setMessage('');
    const joinCode = code.trim().toUpperCase();
    if (!joinCode) return setMessage('Enter a join code.');
    const { data, error } = await supabase.from('tournaments').select('id,title,join_code').eq('join_code', joinCode).maybeSingle();
    if (error || !data) return setMessage('Join code not found.');
    router.push(`/tournament/${data.id}`);
  }

  return <main className="page-shell">
    <div className="hero"><div className="hero-inner"><img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" /><h1 className="hero-title">Join Tournament</h1><p className="hero-subtitle">Enter a code from any phone.</p></div></div>
    <TopNav />
    <div className="card"><div className="grid">
      <div><label className="label">Join code</label><input className="input" value={code} onChange={(e)=>setCode(e.target.value)} placeholder="ABC123" /></div>
      <button className="button primary" onClick={handleJoin}>Join tournament</button>
      {message ? <div className="notice">{message}</div> : null}
    </div></div>
  </main>;
}
