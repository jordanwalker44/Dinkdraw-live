'use client';

import { useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

export default function AdminFeaturesPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [foundUserName, setFoundUserName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [message, setMessage] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  async function findUserByEmail() {
  setMessage('');
  setUserId('');
  setFoundUserName('');

  if (!email.trim()) {
    setMessage('Enter an email address.');
    return;
  }

  setIsWorking(true);

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .ilike('email', email.trim())
    .maybeSingle();

  setIsWorking(false);

  if (error) {
    setMessage(error.message);
    return;
  }

  if (!profile) {
    setMessage('No DinkDraw user found with that email. They need to create an account first.');
    return;
  }

  setUserId(profile.id);
  setFoundUserName(profile.display_name || profile.email || '');
  setMessage(`Found user: ${profile.display_name || profile.email}`);
}

  async function grantUserCream() {
    setMessage('');
    setIsWorking(true);

    const { error } = await supabase.from('feature_entitlements').insert({
      user_id: userId.trim(),
      feature_key: 'cream_of_the_crop',
      status: 'active',
      notes: 'Granted from admin page',
    });

    setIsWorking(false);
    setMessage(error ? error.message : 'Cream access granted to user.');
  }

  async function grantUserOrganizationMode() {
    setMessage('');
    setIsWorking(true);

    const { error } = await supabase.from('feature_entitlements').insert({
      user_id: userId.trim(),
      feature_key: 'organization_mode',
      status: 'active',
      notes: 'Granted from admin page',
    });

    setIsWorking(false);
    setMessage(error ? error.message : 'Organization mode granted to user.');
  }

  async function createOrganizationForUser() {
    setMessage('');

    if (!userId.trim() || !organizationName.trim()) {
      setMessage('Enter a user ID and organization name.');
      return;
    }

    setIsWorking(true);

    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: organizationName.trim(),
        created_by_user_id: userId.trim(),
      })
      .select('id, name')
      .single();

    if (orgError || !organization) {
      setIsWorking(false);
      setMessage(orgError?.message || 'Could not create organization.');
      return;
    }

    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organization.id,
        user_id: userId.trim(),
        role: 'owner',
      });

    if (memberError) {
      setIsWorking(false);
      setMessage(memberError.message);
      return;
    }

    const { error: creamError } = await supabase
      .from('feature_entitlements')
      .insert({
        organization_id: organization.id,
        feature_key: 'cream_of_the_crop',
        status: 'active',
        notes: 'Granted from admin page',
      });

    setIsWorking(false);

    if (creamError) {
      setMessage(creamError.message);
      return;
    }

    setMessage(`Created organization and granted Cream access: ${organization.name}`);
  }

  return (
    <main className="page-shell">
      <TopNav />

      <div className="card">
        <div className="card-title" style={{ color: '#FFCB05' }}>
          Admin Feature Management
        </div>

        <div className="card-subtitle">
          Internal tool for granting DinkDraw premium access.
        </div>

        <div className="grid" style={{ gap: 14 }}>
          <div>
  <label className="label">User email</label>
  <input
    className="input"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    placeholder="tester@example.com"
    autoCapitalize="none"
    autoCorrect="off"
  />

  <button
    type="button"
    className="button secondary"
    onClick={findUserByEmail}
    disabled={isWorking || !email.trim()}
    style={{ marginTop: 10 }}
  >
    Find User
  </button>

  {userId ? (
    <div className="notice" style={{ marginTop: 10 }}>
      Selected: {foundUserName || email}
    </div>
  ) : null}
</div>

          <div>
            <label className="label">Organization name</label>
            <input
              className="input"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Example: Utah Pickleball Club"
            />
          </div>

          <button
            type="button"
            className="button primary"
            onClick={createOrganizationForUser}
            disabled={isWorking}
          >
            Create Organization + Grant Cream
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={grantUserCream}
            disabled={isWorking || !userId.trim()}
          >
            Grant Cream to User
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={grantUserOrganizationMode}
            disabled={isWorking || !userId.trim()}
          >
            Grant Organization Mode to User
          </button>

          {message ? <div className="notice">{message}</div> : null}
        </div>
      </div>
    </main>
  );
}
