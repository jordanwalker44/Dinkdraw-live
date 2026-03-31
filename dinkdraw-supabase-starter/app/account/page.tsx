'use client';
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';;

export default function AccountPage() {
  const supabase = getSupabaseBrowserClient();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ''));
  }, [supabase]);

  async function handleAuth() {
    setMessage('');
    if (!email || !password) return setMessage('Please enter email and password.');
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return setMessage(error.message);
      if (data.user) {
        const displayName = name.trim() || email.split('@')[0];
        await supabase.from('profiles').upsert({ id: data.user.id, display_name: displayName, email: data.user.email });
        await supabase.from('lifetime_stats').upsert({ user_id: data.user.id });
      }
      setUserEmail(email);
      return setMessage('Account created. If email confirmation is on, check your inbox.');
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMessage(error.message);
    setUserEmail(data.user.email ?? email);
    setMessage('Signed in.');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUserEmail('');
    setMessage('Signed out.');
  }

  return <main className="page-shell">
    <div className="hero"><div className="hero-inner"><img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" /><h1 className="hero-title">Account</h1><p className="hero-subtitle">Real Supabase auth starts here.</p></div></div>
    <TopNav />
    <div className="card"><div className="row" style={{marginBottom:16}}>
      <button className={`button ${mode === 'signup' ? 'primary' : 'secondary'}`} onClick={() => setMode('signup')}>Create account</button>
      <button className={`button ${mode === 'signin' ? 'primary' : 'secondary'}`} onClick={() => setMode('signin')}>Sign in</button>
    </div>
    <div className="grid">
      {mode === 'signup' ? <div><label className="label">Name</label><input className="input" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" /></div> : null}
      <div><label className="label">Email</label><input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" /></div>
      <div><label className="label">Password</label><input className="input" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" /></div>
      <button className="button primary" onClick={handleAuth}>{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      {userEmail ? <button className="button secondary" onClick={handleSignOut}>Sign out</button> : null}
      {message ? <div className="notice">{message}</div> : null}
      {userEmail ? <div className="muted">Signed in as {userEmail}</div> : <div className="muted">Not signed in</div>}
    </div></div>
  </main>;
}
