'use client';

import { useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

type OrganizationOption = {
  id: string;
  name: string;
  role: string | null;
};

export default function AdminFeaturesPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [foundUserName, setFoundUserName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [userOrganizations, setUserOrganizations] = useState<OrganizationOption[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [renameOrganizationName, setRenameOrganizationName] = useState('');
  const [message, setMessage] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  async function ensureFeatureEntitlement({
    userId,
    organizationId,
    featureKey,
    notes,
  }: {
    userId?: string | null;
    organizationId?: string | null;
    featureKey: string;
    notes: string;
  }) {
    let existingQuery = supabase
      .from('feature_entitlements')
      .select('id')
      .eq('feature_key', featureKey)
      .limit(1);

    existingQuery = userId
      ? existingQuery.eq('user_id', userId)
      : existingQuery.is('user_id', null);

    existingQuery = organizationId
      ? existingQuery.eq('organization_id', organizationId)
      : existingQuery.is('organization_id', null);

    const { data: existingRows, error: lookupError } = await existingQuery;

    if (lookupError) return lookupError;

    const existing = existingRows?.[0];

    if (existing?.id) {
      const { error } = await supabase
        .from('feature_entitlements')
        .update({
          status: 'active',
          notes,
        })
        .eq('id', existing.id);

      return error;
    }

    const { error } = await supabase.from('feature_entitlements').insert({
      user_id: userId || null,
      organization_id: organizationId || null,
      feature_key: featureKey,
      status: 'active',
      notes,
    });

    return error;
  }

  async function findUserByEmail() {
  setMessage('');
  setUserId('');
  setFoundUserName('');
  setUserOrganizations([]);
  setSelectedOrganizationId('');
  setRenameOrganizationName('');

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

  if (error) {
    setIsWorking(false);
    setMessage(error.message);
    return;
  }

  if (!profile) {
    setIsWorking(false);
    setMessage('No DinkDraw user found with that email. They need to create an account first.');
    return;
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from('organization_members')
    .select('role, organizations(id, name)')
    .eq('user_id', profile.id)
    .order('role', { ascending: true });

  setIsWorking(false);

  if (membershipsError) {
    setMessage(membershipsError.message);
    return;
  }

  const organizations: OrganizationOption[] =
    memberships
      ?.map((membership: any) => {
        const organization = membership.organizations;
        if (!organization?.id) return null;

        return {
          id: organization.id,
          name: organization.name || 'Unnamed Organization',
          role: membership.role || null,
        };
      })
      .filter((organization): organization is OrganizationOption => !!organization) || [];

  setUserId(profile.id);
  setFoundUserName(profile.display_name || profile.email || '');
  setUserOrganizations(organizations as OrganizationOption[]);

  if (organizations.length > 0) {
    setSelectedOrganizationId(organizations[0].id);
    setRenameOrganizationName(organizations[0].name);
  }

  setMessage(
    organizations.length > 0
      ? `Found user: ${profile.display_name || profile.email}. ${organizations.length} organization(s) found.`
      : `Found user: ${profile.display_name || profile.email}. No organizations found.`
  );
}

  async function grantUserCream() {
    setMessage('');
    setIsWorking(true);

    const error = await ensureFeatureEntitlement({
      userId: userId.trim(),
      featureKey: 'cream_of_the_crop',
      notes: 'Granted from admin page',
    });

    setIsWorking(false);
    setMessage(error ? error.message : 'Cream access granted to user.');
  }

  async function grantUserOrganizationMode() {
    setMessage('');
    setIsWorking(true);

    const error = await ensureFeatureEntitlement({
      userId: userId.trim(),
      featureKey: 'organization_mode',
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

    const organizationModeError = await ensureFeatureEntitlement({
      userId: userId.trim(),
      featureKey: 'organization_mode',
      notes: `Granted from admin page for ${organization.name}`,
    });

    if (organizationModeError) {
      setIsWorking(false);
      setMessage(organizationModeError.message);
      return;
    }

    const userCreamError = await ensureFeatureEntitlement({
      userId: userId.trim(),
      featureKey: 'cream_of_the_crop',
      notes: `Granted from admin page for ${organization.name}`,
    });

    if (userCreamError) {
      setIsWorking(false);
      setMessage(userCreamError.message);
      return;
    }

    const organizationCreamError = await ensureFeatureEntitlement({
      organizationId: organization.id,
      featureKey: 'cream_of_the_crop',
      notes: 'Granted from admin page',
    });

    setIsWorking(false);

    if (organizationCreamError) {
      setMessage(organizationCreamError.message);
      return;
    }

    setMessage(`Created organization, enabled organization mode, and granted Cream access: ${organization.name}`);
    setUserOrganizations((current) => [
      ...current,
      { id: organization.id, name: organization.name, role: 'owner' },
    ]);
    setSelectedOrganizationId(organization.id);
    setRenameOrganizationName(organization.name);
    setOrganizationName('');
  }

  async function renameSelectedOrganization() {
    setMessage('');

    if (!selectedOrganizationId || !renameOrganizationName.trim()) {
      setMessage('Choose an organization and enter the new name.');
      return;
    }

    setIsWorking(true);

    const { data: organization, error } = await supabase
      .from('organizations')
      .update({ name: renameOrganizationName.trim() })
      .eq('id', selectedOrganizationId)
      .select('id, name')
      .single();

    setIsWorking(false);

    if (error || !organization) {
      setMessage(error?.message || 'Could not rename organization.');
      return;
    }

    setUserOrganizations((current) =>
      current.map((item) =>
        item.id === organization.id ? { ...item, name: organization.name } : item
      )
    );
    setMessage(`Organization renamed to ${organization.name}.`);
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

          {userId ? (
            <div
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,0.035)',
              }}
            >
              <div className="card-title" style={{ fontSize: 18, marginBottom: 8 }}>
                Existing Organizations
              </div>

              {userOrganizations.length > 0 ? (
                <div className="grid" style={{ gap: 10 }}>
                  <div>
                    <label className="label">Organization to rename</label>
                    <select
                      className="input"
                      value={selectedOrganizationId}
                      onChange={(event) => {
                        const selected = userOrganizations.find(
                          (organization) => organization.id === event.target.value
                        );

                        setSelectedOrganizationId(event.target.value);
                        setRenameOrganizationName(selected?.name || '');
                      }}
                    >
                      {userOrganizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                          {organization.role ? ` (${organization.role})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">New organization name</label>
                    <input
                      className="input"
                      value={renameOrganizationName}
                      onChange={(event) => setRenameOrganizationName(event.target.value)}
                      placeholder="Updated organization name"
                    />
                  </div>

                  <button
                    type="button"
                    className="button secondary"
                    onClick={renameSelectedOrganization}
                    disabled={isWorking || !selectedOrganizationId || !renameOrganizationName.trim()}
                  >
                    Rename Selected Organization
                  </button>
                </div>
              ) : (
                <div className="muted">This user does not belong to any organizations yet.</div>
              )}
            </div>
          ) : null}

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
