'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';

export default function ResetPasswordPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      setIsValidSession(!!data.session);
      setIsCheckingSession(false);
    }

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsValidSession(!!session);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleReset() {
    setMessage('');

    if (!password.trim()) {
      setMessage('Please enter a new password.');
      return;
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(error.message);
      setIsLoading(false);
      return;
    }

    setMessage('Password updated successfully! Redirecting...');

    setTimeout(() => {
      router.push('/account');
    }, 2000);

    setIsLoading(false);
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <p className="hero-subtitle">Reset your password.</p>
        </div>
      </div>

      <TopNav />

      {isCheckingSession ? (
        <div className="card">
          <div className="muted">Verifying reset link...</div>
        </div>
      ) : !isValidSession ? (
        <div className="card">
          <div className="card-title">Invalid or Expired Link</div>
          <div className="card-subtitle">
            This reset link has expired or already been used. Request a new one from the account page.
          </div>
          <button className="button primary" onClick={() => router.push('/account')}>
            Back to Account
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">Set New Password</div>
          <div className="card-subtitle">
            Choose a new password for your DinkDraw account.
          </div>

          <div className="grid">
            <div>
              <label className="label">New Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>

            <div>
              <label className="label">Confirm Password</label>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your new password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isLoading) void handleReset();
                }}
              />
            </div>

            <button
              className="button primary"
              onClick={handleReset}
              disabled={isLoading}
            >
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>

            {message ? <div className="notice">{message}</div> : null}
          </div>
        </div>
      )}
    </main>
  );
}
