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
    // Supabase puts the token in the URL hash as #access_token=...&type=recovery
    // We need to let Supabase process it automatically via onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // This fires when the recovery link is clicked
        setIsValidSession(true);
        setIsCheckingSession(false);
      } else if (event === 'SIGNED_IN' && session) {
        setIsValidSession(true);
        setIsCheckingSession(false);
      } else if (event === 'SIGNED_OUT') {
        setIsValidSession(false);
        setIsCheckingSession(false);
      }
    });

    // Also check existing session in case they're already signed in via the link
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setIsValidSession(true);
      }
      setIsCheckingSession(false);
    }

    checkSession();

    return () => { subscription.unsubscribe(); };
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

    setIsLoadin
