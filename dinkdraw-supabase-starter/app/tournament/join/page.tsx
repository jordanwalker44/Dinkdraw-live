'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

export default function JoinTournamentPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleJoin() {
    setMessage('');
    const joinCode = code.trim().toUpperCase();

    if (!joinCode) {
      setMessage('Enter a join code.');
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase
      .from('tournaments')
      .select('id, title, join_code')
      .eq('join_code', joinCode)
      .maybeSingle();

    setIsLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (!data) {
      setMessage(`No tournament found for code "${joinCode}".`);
      return;
    }

    router.push(`/tournament/${data.id}`);
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">Join Tournament</h1>
          <p className="hero-subtitle">Enter a join code from any phone.</p>
        </div>
      </div>

      <TopNav />

      <div className="card">
        <div className="grid">
          <div>
            <label className="label">Join code</label>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <button className="button primary" onClick={handleJoin} disabled={isLoading}>
            {isLoading ? 'Joining...' : 'Join tournament'}
          </button>

          {message ? <div className="notice">{message}</div> : null}
        </div>
      </div>
    </main>
  );
}
