'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';

type AuthMode = 'signup' | 'signin';

export default function AccountPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      setUserEmail(user?.email ?? '');
      setEmail(user?.email ?? '');

      if (!user) {
        setProfileName('');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();

      const resolvedName = profile?.display_name || user.email?.split('@')[0] || '';
      setProfileName(resolvedName);
      setName(resolvedName);
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user;

      setUserEmail(user?.email ?? '');
      setEmail(user?.email ?? '');

      if (!user) {
        setProfileName('');
        setName('');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();

      const resolvedName = profile?.display_name || user.email?.split('@')[0] || '';
      setProfileName(resolvedName);
      setName(resolvedName);
    });

    return () => { subscription.unsubscribe(); };
  }, [supabase]);

  async function handleAuth() {
    setMessage('');

    if (!email.trim() || !password.trim()) {
      setMessage('Please enter your email and password.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) { setMessage(error.message); setIsLoading(false); return; }

        if (data.user) {
          const displayName = name.trim() || email.trim().split('@')[0];
          await supabase.from('profiles').upsert({
            id: data.user.id,
            display_name: displayName,
            email: data.user.email,
          });
          await supabase.from('lifetime_stats').upsert({ user_id: data.user.id });
          setProfileName(displayName);
          setName(displayName);
        }

        setUserEmail(email.trim());
        setMessage('Account created. You can sign in now, or check your email if confirmation is required.');
        setMode('signin');
        setPassword('');
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) { setMessage(error.message); setIsLoading(false); return; }

      const signedInEmail = data.user.email ?? email.trim();
      setUserEmail(signedInEmail);

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', data.user.id)
        .maybeSingle();

      const resolvedName = profile?.display_name || signedInEmail.split('@')[0] || '';
      setProfileName(resolvedName);
      setName(resolvedName);
      setPassword('');

      if (profile?.display_name?.trim()) {
        router.push('/');
      } else {
        setMessage('You are now signed in. Please set your display name below.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }

    setIsLoading(false);
  }

  async function handleForgotPassword() {
    setMessage('');

    if (!email.trim()) {
      setMessage('Enter your email address first, then click Forgot Password.');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://dinkdraw.app/reset-password',
    });

    if (error) { setMessage(error.message); setIsLoading(false); return; }

    setMessage('Password reset email sent! Check your inbox.');
    setIsLoading(false);
  }

  async function handleSaveDisplayName() {
    setMessage('');

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) { setMessage('Sign in first.'); return; }

    const nextName = profileName.trim() || user.email?.split('@')[0] || 'Player';
    setIsSavingProfile(true);

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      display_name: nextName,
      email: user.email,
    });

    if (error) { setMessage(error.message); setIsSavingProfile(false); return; }

    setProfileName(nextName);
    setName(nextName);
    setMessage('Display name saved.');
    setIsSavingProfile(false);
  }

  async function handleSignOut() {
    setMessage('');
    setIsLoading(true);
    await supabase.auth.signOut();
    setUserEmail('');
    setProfileName('');
    setName('');
    setPassword('');
    setMessage('You have been signed out.');
    setIsLoading(false);
  }

  const initials = (profileName || userEmail || 'DD')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2);

  return (
    <main className="page-shell">
      <TopNav />

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      {userEmail ? (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-title">Quick Actions</div>
      <div className="grid">
        <Link href="/my-stats" className="action-button blue">
          <div className="action-title">My Stats</div>
          <div className="action-subtitle">
            View your wins, losses, and performance
          </div>
        </Link>
      </div>
    </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Status</div>
            <div
              className="list-item"
              style={{
                borderColor: 'rgba(255,203,5,.45)',
                boxShadow: '0 0 0 1px rgba(255,203,5,.18) inset',
              }}
            >
              <div className="row-between">
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>Signed In</div>
                  <div className="muted">{userEmail}</div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Display name: {profileName || 'Not set'}
                  </div>
                </div>
                <span className="tag green">Active</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Profile</div>
            <div className="card-subtitle">
              This is the name DinkDraw uses when you create tournaments or claim spots.
            </div>
            <div className="grid">
              <div>
                <label className="label">Display Name</label>
                <input
                  className="input"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Your display name"
                />
              </div>
              <button className="button primary" onClick={handleSaveDisplayName} disabled={isSavingProfile}>
                {isSavingProfile ? 'Saving...' : 'Save Display Name'}
              </button>
              <button className="button secondary" onClick={handleSignOut} disabled={isLoading}>
                {isLoading ? 'Signing Out...' : 'Sign Out'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <div className="card-title">{mode === 'signin' ? 'Sign In' : 'Create Account'}</div>
          <div className="card-subtitle">
            {mode === 'signin'
              ? 'Use your account to access saved tournaments, rankings, and stats.'
              : 'Create an account so your results and profile stay connected to you.'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              className={`button ${mode === 'signin' ? 'primary' : 'secondary'}`}
              onClick={() => setMode('signin')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`button ${mode === 'signup' ? 'primary' : 'secondary'}`}
              onClick={() => setMode('signup')}
            >
              Create
            </button>
          </div>

          <div className="grid">
            {mode === 'signup' ? (
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
            ) : null}

            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isLoading) void handleAuth();
                }}
              />
            </div>

            <button className="button primary" onClick={handleAuth} disabled={isLoading}>
              {isLoading
                ? mode === 'signup' ? 'Creating Account...' : 'Signing In...'
                : mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>

            {mode === 'signin' ? (
              <button
                type="button"
                className="button secondary"
                onClick={handleForgotPassword}
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : 'Forgot Password'}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}
