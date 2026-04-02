'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';

type AuthMode = 'signup' | 'signin';

export default function AccountPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

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
      const { data } = await supabase.auth.getUser();
      const user = data.user;

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
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

    return () => {
      subscription.unsubscribe();
    };
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

        if (error) {
          setMessage(error.message);
          setIsLoading(false);
          return;
        }

        if (data.user) {
          const displayName = name.trim() || email.trim().split('@')[0];

          await supabase.from('profiles').upsert({
            id: data.user.id,
            display_name: displayName,
            email: data.user.email,
          });

          await supabase.from('lifetime_stats').upsert({
            user_id: data.user.id,
          });

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

      if (error) {
        setMessage(error.message);
        setIsLoading(false);
        return;
      }

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

      setMessage('You are now signed in.');
      setPassword('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }

    setIsLoading(false);
  }

  async function handleSaveDisplayName() {
    setMessage('');

    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
      setMessage('Sign in first.');
      return;
    }

    const nextName = profileName.trim() || user.email?.split('@')[0] || 'Player';

    setIsSavingProfile(true);

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      display_name: nextName,
      email: user.email,
    });

    if (error) {
      setMessage(error.message);
      setIsSavingProfile(false);
      return;
    }

    setProfileName(nextName);
    setName(nextName);
    setMessage('Display name saved. New tournaments and claimed spots will use this name.');
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

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">Account</h1>
          <p className="hero-subtitle">
            Sign in fast, manage your profile, and keep your tournaments connected to you.
          </p>
        </div>
      </div>

      <TopNav />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Account Status</div>

        {userEmail ? (
          <div
            className="list-item"
            style={{
              borderColor: 'rgba(163,230,53,.45)',
              boxShadow: '0 0 0 1px rgba(163,230,53,.18) inset',
            }}
          >
            <div className="row-between" style={{ alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Signed In</div>
                <div className="muted">{userEmail}</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Default display name: {profileName || 'Not set'}
                </div>
              </div>
              <span className="tag green">Active</span>
            </div>
          </div>
        ) : (
          <div className="list-item">
            <div className="row-between" style={{ alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Not Signed In</div>
                <div className="muted">Sign in to save tournaments and resume them later.</div>
              </div>
              <span className="tag">Guest</span>
            </div>
          </div>
        )}
      </div>

      {message ? (
        <div
          className="notice"
          style={{
            marginBottom: 16,
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      ) : null}

      {userEmail ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Profile</div>
          <div className="card-subtitle">
            This is the default name DinkDraw will use when you create tournaments or claim spots.
          </div>

          <div className="grid">
            <div>
              <label className="label">Display name</label>
              <input
                className="input"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Your display name"
              />
            </div>

            <button
              className="button primary"
              onClick={handleSaveDisplayName}
              disabled={isSavingProfile}
            >
              {isSavingProfile ? 'Saving...' : 'Save Display Name'}
            </button>

            <button className="button secondary" onClick={handleSignOut} disabled={isLoading}>
              {isLoading ? 'Working...' : 'Sign Out'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="row" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <button
            className={`button ${mode === 'signin' ? 'primary' : 'secondary'}`}
            onClick={() => setMode('signin')}
            type="button"
          >
            Sign In
          </button>

          <button
            className={`button ${mode === 'signup' ? 'primary' : 'secondary'}`}
            onClick={() => setMode('signup')}
            type="button"
          >
            Create Account
          </button>
        </div>

        <div className="card-subtitle" style={{ marginBottom: 16 }}>
          {mode === 'signin'
            ? 'Sign in is the fastest way to get back into your tournaments.'
            : 'Create an account so your tournaments and name stay connected to you.'}
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
                if (e.key === 'Enter' && !isLoading) {
                  void handleAuth();
                }
              }}
            />
          </div>

          <button className="button primary" onClick={handleAuth} disabled={isLoading}>
            {isLoading
              ? mode === 'signup'
                ? 'Creating Account...'
                : 'Signing In...'
              : mode === 'signup'
              ? 'Create Account'
              : 'Sign In'}
          </button>
        </div>
      </div>
    </main>
  );
}
