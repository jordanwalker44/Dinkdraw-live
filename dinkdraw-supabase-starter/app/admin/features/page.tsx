'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

type OrganizationOption = {
  id: string;
  name: string;
  role: string | null;
};

function getRpcRow<T>(data: T | T[] | null): T | null {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

export default function AdminFeaturesPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [foundUserName, setFoundUserName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [userOrganizations, setUserOrganizations] = useState<OrganizationOption[]>([]);
  const [userEntitlements, setUserEntitlements] = useState<string[]>([]);
  const [organizationEntitlements, setOrganizationEntitlements] = useState<Record<string, string[]>>({});
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [renameOrganizationName, setRenameOrganizationName] = useState('');
  const [message, setMessage] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  async function findUserByEmail() {
  setMessage('');
  setUserId('');
  setFoundUserName('');
  setUserOrganizations([]);
  setUserEntitlements([]);
  setOrganizationEntitlements({});
  setSelectedOrganizationId('');
  setRenameOrganizationName('');

  if (!email.trim()) {
    setMessage('Enter an email address.');
    return;
  }

  setIsWorking(true);

  const { data, error } = await supabase.rpc('admin_find_user_by_email', {
    p_email: email.trim(),
  });

  const profile = getRpcRow<{ id: string; display_name: string | null; email: string }>(data);

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

  const organizationIds = organizations.map((organization) => organization.id);
  const [{ data: userAccess, error: userAccessError }, { data: organizationAccess, error: organizationAccessError }] =
    await Promise.all([
      supabase
        .from('feature_entitlements')
        .select('feature_key')
        .eq('user_id', profile.id)
        .eq('status', 'active'),
      organizationIds.length
        ? supabase
            .from('feature_entitlements')
            .select('organization_id, feature_key')
            .in('organization_id', organizationIds)
            .eq('status', 'active')
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (userAccessError || organizationAccessError) {
    setIsWorking(false);
    setMessage(userAccessError?.message || organizationAccessError?.message || 'Could not load access.');
    return;
  }

  const accessByOrganization = (organizationAccess || []).reduce<Record<string, string[]>>(
    (result, entitlement) => {
      if (!entitlement.organization_id) return result;
      result[entitlement.organization_id] = [
        ...(result[entitlement.organization_id] || []),
        entitlement.feature_key,
      ];
      return result;
    },
    {}
  );

  setUserId(profile.id);
  setFoundUserName(profile.display_name || profile.email || '');
  setUserOrganizations(organizations as OrganizationOption[]);
  setUserEntitlements((userAccess || []).map((entitlement) => entitlement.feature_key));
  setOrganizationEntitlements(accessByOrganization);

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

  async function setFeatureAccess({
    featureKey,
    enabled,
    organizationId = null,
  }: {
    featureKey: string;
    enabled: boolean;
    organizationId?: string | null;
  }) {
    setMessage('');
    setIsWorking(true);

    const { error } = await supabase.rpc('admin_set_feature_entitlement_status', {
      p_user_id: organizationId ? null : userId.trim(),
      p_organization_id: organizationId,
      p_feature_key: featureKey,
      p_status: enabled ? 'active' : 'inactive',
      p_notes: `${enabled ? 'Granted' : 'Revoked'} from admin page`,
    });

    setIsWorking(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    if (organizationId) {
      setOrganizationEntitlements((current) => {
        const keys = new Set(current[organizationId] || []);
        enabled ? keys.add(featureKey) : keys.delete(featureKey);
        return { ...current, [organizationId]: [...keys] };
      });
    } else {
      setUserEntitlements((current) => {
        const keys = new Set(current);
        enabled ? keys.add(featureKey) : keys.delete(featureKey);
        return [...keys];
      });
    }

    setMessage(`${featureKey.replaceAll('_', ' ')} access ${enabled ? 'enabled' : 'disabled'}.`);
  }

  async function createOrganizationForUser() {
    setMessage('');

    if (!userId.trim() || !organizationName.trim()) {
      setMessage('Enter a user ID and organization name.');
      return;
    }

    setIsWorking(true);

    const { data, error } = await supabase.rpc('admin_create_organization_with_access', {
      p_user_id: userId.trim(),
      p_organization_name: organizationName.trim(),
    });

    setIsWorking(false);

    const organization = getRpcRow<{ id: string; name: string }>(data);

    if (error || !organization) {
      setMessage(error?.message || 'Could not create organization.');
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

    const { data, error } = await supabase.rpc('admin_rename_organization', {
      p_organization_id: selectedOrganizationId,
      p_organization_name: renameOrganizationName.trim(),
    });

    setIsWorking(false);

    const organization = getRpcRow<{ id: string; name: string }>(data);

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

        <Link
          className="button secondary"
          href="/admin/monitor"
          style={{ display: 'inline-flex', marginBottom: 14, width: 'auto' }}
        >
          Open Tournament Monitor
        </Link>

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

                  <button
                    type="button"
                    className={`button ${organizationEntitlements[selectedOrganizationId]?.includes('league_mode') ? 'secondary' : 'primary'}`}
                    onClick={() => setFeatureAccess({
                      featureKey: 'league_mode',
                      enabled: !organizationEntitlements[selectedOrganizationId]?.includes('league_mode'),
                      organizationId: selectedOrganizationId,
                    })}
                    disabled={isWorking || !selectedOrganizationId}
                  >
                    {organizationEntitlements[selectedOrganizationId]?.includes('league_mode')
                      ? 'Turn Off League Access'
                      : 'Turn On League Access'}
                  </button>

                  <button
                    type="button"
                    className={`button ${organizationEntitlements[selectedOrganizationId]?.includes('round_robin_pool_brackets') ? 'secondary' : 'primary'}`}
                    onClick={() => setFeatureAccess({
                      featureKey: 'round_robin_pool_brackets',
                      enabled: !organizationEntitlements[selectedOrganizationId]?.includes('round_robin_pool_brackets'),
                      organizationId: selectedOrganizationId,
                    })}
                    disabled={isWorking || !selectedOrganizationId}
                  >
                    {organizationEntitlements[selectedOrganizationId]?.includes('round_robin_pool_brackets')
                      ? 'Turn Off Pool + Bracket Access'
                      : 'Turn On Pool + Bracket Access'}
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
            onClick={() => setFeatureAccess({
              featureKey: 'cream_of_the_crop',
              enabled: !userEntitlements.includes('cream_of_the_crop'),
            })}
            disabled={isWorking || !userId.trim()}
          >
            {userEntitlements.includes('cream_of_the_crop') ? 'Turn Off Cream Access' : 'Turn On Cream Access'}
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={() => setFeatureAccess({
              featureKey: 'organization_mode',
              enabled: !userEntitlements.includes('organization_mode'),
            })}
            disabled={isWorking || !userId.trim()}
          >
            {userEntitlements.includes('organization_mode')
              ? 'Turn Off Organization Mode'
              : 'Turn On Organization Mode'}
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={() => setFeatureAccess({
              featureKey: 'round_robin_pool_brackets',
              enabled: !userEntitlements.includes('round_robin_pool_brackets'),
            })}
            disabled={isWorking || !userId.trim()}
          >
            {userEntitlements.includes('round_robin_pool_brackets')
              ? 'Turn Off Pool + Bracket Access'
              : 'Turn On Pool + Bracket Access'}
          </button>

          {message ? <div className="notice">{message}</div> : null}
        </div>
      </div>
    </main>
  );
}
