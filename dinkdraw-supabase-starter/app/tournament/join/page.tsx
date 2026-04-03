'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

function normalizeJoinCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
}

export default function JoinTournamentPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('code') || '';

    if (codeFromUrl) {
      setCode(normalizeJoinCode(codeFromUrl));
    }
  }, []);

  const normalizedCode = normalizeJoinCode(code);
  const canJoin = normalizedCode.length > 0 && !isLoading;

  async function handleJoin() {
    setMessage('');

    const joinCode = normalizeJoinCode(code);

    if (!joinCode) {
      setMessage('Enter a join code.');
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase
      .from('tournaments')
      .select('id, title, join_code, status')
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
          <p className="hero-subtitle">
            Enter a join code from any phone and jump right into the event.
          </p>
        </div>
      </div>

      <TopNav />

      <div className="card">
        <div className="card-title">Enter Join Code</div>
        <div className="card-subtitle">
          Ask the organizer for the 6-character code.
        </div>

        <div className="grid">
          <div>
            <label className="label">Join code</label>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(normalizeJoinCode(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canJoin) {
                  void handleJoin();
                }
              }}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              maxLength={6}
              style={{
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                textAlign: 'center',
                fontSize: 28,
                fontWeight: 800,
              }}
            />
          </div>

          <div className="list-item">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Tip</div>
            <div className="muted">
              Codes ignore spaces and lowercase letters, so players can paste them in fast.
            </div>
          </div>

          <button className="button primary" onClick={handleJoin} disabled={!canJoin}>
            {isLoading ? 'Joining...' : 'Join Tournament'}
          </button>

          {message ? <div className="notice">{message}</div> : null}
        </div>
      </div>
    </main>
  );
}