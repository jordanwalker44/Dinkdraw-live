'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';

type AuthMode = 'signup' | 'signin';

function getSafeRedirectPath() {
  if (typeof window === 'undefined') return '/';

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');

  if (!redirect) return '/';
  if (!redirect.startsWith('/')) return '/';
  if (redirect.startsWith('//')) return '/';

  return redirect;
}

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
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [hasLeagueAccess, setHasLeagueAccess] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      setUserEmail(user?.email ?? '');
      setEmail(user?.email ?? '');

      if (!user) {
        setProfileName('');
        setHasLeagueAccess(false);
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

      const { data: accessibleLeagues } = await supabase
        .from('leagues')
        .select('id')
        .limit(1);

      if (accessibleLeagues?.length) {
        setHasLeagueAccess(true);
      } else {
        const { data: memberships } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .in('role', ['owner', 'admin']);
        const organizationIds = (memberships || []).map((membership) => membership.organization_id);
        const { data: entitlements } = organizationIds.length
          ? await supabase
              .from('feature_entitlements')
              .select('organization_id')
              .in('organization_id', organizationIds)
              .eq('feature_key', 'league_mode')
              .eq('status', 'active')
              .limit(1)
          : { data: [] as { organization_id: string }[] };
        setHasLeagueAccess(Boolean(entitlements?.length));
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user;

      setUserEmail(user?.email ?? '');
      setEmail(user?.email ?? '');

      if (!user) {
        setProfileName('');
        setName('');
        setHasLeagueAccess(false);
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
        const displayName = name.trim() || email.trim().split('@')[0];
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName,
            },
          },
        });

        if (error) {
  const friendlyMessage =
    error.message.toLowerCase().includes('invalid login credentials')
      ? 'Incorrect email or password. Please try again.'
      : error.message;

  setMessage(friendlyMessage);
  setIsLoading(false);
  return;
}

        if (data.user) {
          setProfileName(displayName);
          setName(displayName);
        }

                setUserEmail(email.trim());

        if (data.session?.user) {
          router.push(getSafeRedirectPath());
          setIsLoading(false);
          return;
        }

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
        router.push(getSafeRedirectPath());
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

    const redirectPath = getSafeRedirectPath();
    if (redirectPath !== '/') {
      router.push(redirectPath);
    }
  }

  async function handleDeleteAccount() {
  const confirmed = window.confirm(
    'Delete your DinkDraw account permanently? This cannot be undone.'
  );

  if (!confirmed) return;

  setMessage('');
  setIsDeletingAccount(true);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    if (!token) {
      setMessage('You must be signed in.');
      setIsDeletingAccount(false);
      return;
    }

    const response = await fetch(
      'https://iboqlzgjkakvnhwezrgx.supabase.co/functions/v1/delete-account',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || 'Failed to delete account.');
      setIsDeletingAccount(false);
      return;
    }

    await supabase.auth.signOut();

    setUserEmail('');
    setProfileName('');
    setName('');
    setPassword('');

    setMessage('Your account has been permanently deleted.');
  } catch (err) {
    setMessage(
      err instanceof Error ? err.message : 'Something went wrong.'
    );
  }

  setIsDeletingAccount(false);
}

  async function handleSignOut() {
  setMessage('');
  setIsLoading(true);

  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Sign out failed:', err);
  }

  setUserEmail('');
  setProfileName('');
  setName('');
  setPassword('');
  setEmail('');
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
        <Link href="/training" className="action-button blue">
          <div className="action-title">Training</div>
          <div className="action-subtitle">
            Track drilling, play, goals, and progress
          </div>
        </Link>
        {hasLeagueAccess ? (
          <Link href="/leagues" className="action-button blue">
            <div className="action-title">Premium Leagues</div>
            <div className="action-subtitle">
              View your league, roster, schedule, and standings
            </div>
          </Link>
        ) : null}
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
              <button
                className="button secondary"
                onClick={handleSignOut}
                disabled={isLoading}
              >
                {isLoading ? 'Signing Out...' : 'Sign Out'}
              </button>

              <button
                className="button secondary"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                style={{
                  borderColor: 'rgba(255,80,80,.45)',
                  color: '#ff8080',
                }}
              >
                {isDeletingAccount ? 'Deleting Account...' : 'Delete My Account'}
              </button>

              <Link
                href="/privacy"
                className="button secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Privacy Policy
              </Link>
              <Link
                href="/support"
                className="button secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Support
              </Link>
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
