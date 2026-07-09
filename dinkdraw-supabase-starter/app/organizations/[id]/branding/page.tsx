'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from '../../../../components/TopNav';
import {
  OrganizationBrandBanner,
  type OrganizationBrand,
} from '../../../../components/OrganizationBrandBanner';
import { getSupabaseBrowserClient } from '../../../../lib/supabase-browser';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export default function OrganizationBrandingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#00274C');
  const [accentColor, setAccentColor] = useState('#FFCB05');

  const previewBrand: OrganizationBrand = {
    id: params.id,
    name: name.trim() || 'Your Club',
    logo_url: logoUrl.trim() || null,
    primary_color: primaryColor,
    accent_color: accentColor,
  };

  useEffect(() => {
    async function loadOrganization() {
      setIsLoading(true);
      setMessage('');

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.push(`/account?redirect=${encodeURIComponent(`/organizations/${params.id}/branding`)}`);
        return;
      }

      const [organizationResult, membershipResult] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name, logo_url, primary_color, accent_color')
          .eq('id', params.id)
          .maybeSingle(),
        supabase
          .from('organization_members')
          .select('role')
          .eq('organization_id', params.id)
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (organizationResult.error) {
        setMessage(organizationResult.error.message);
      }

      const organization = organizationResult.data;
      if (!organization) {
        setMessage('Organization not found.');
        setIsLoading(false);
        return;
      }

      const role = membershipResult.data?.role;
      const editable = role === 'owner' || role === 'admin';

      setCanEdit(editable);
      setName(organization.name || '');
      setLogoUrl(organization.logo_url || '');
      setPrimaryColor(organization.primary_color || '#00274C');
      setAccentColor(organization.accent_color || '#FFCB05');

      if (!editable) {
        setMessage('Only organization owners and admins can edit branding.');
      }

      setIsLoading(false);
    }

    void loadOrganization();
  }, [params.id, router, supabase]);

  async function saveBranding() {
    setMessage('');

    if (!canEdit) {
      setMessage('Only organization owners and admins can edit branding.');
      return;
    }

    if (!name.trim()) {
      setMessage('Enter a club or organization name.');
      return;
    }

    if (!HEX_COLOR_PATTERN.test(primaryColor)) {
      setMessage('Primary color must look like #00274C.');
      return;
    }

    if (!HEX_COLOR_PATTERN.test(accentColor)) {
      setMessage('Accent color must look like #FFCB05.');
      return;
    }

    setIsSaving(true);

    const { error } = await supabase
      .from('organizations')
      .update({
        name: name.trim(),
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor.trim(),
        accent_color: accentColor.trim(),
      })
      .eq('id', params.id);

    setIsSaving(false);
    setMessage(error ? error.message : 'Branding saved.');
  }

  return (
    <main className="page-shell">
      <TopNav />

      <div style={{ marginBottom: 12 }}>
        <Link
          href="/tournament/create"
          style={{
            color: '#FFCB05',
            fontWeight: 900,
            fontSize: 14,
          }}
        >
          Back to Create Tournament
        </Link>
      </div>

      <div className="card">
        <div className="card-title" style={{ color: '#FFCB05' }}>
          Club Branding
        </div>
        <div className="card-subtitle">
          Customize how your club appears on DinkDraw tournament pages.
        </div>

        {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

        {isLoading ? (
          <div className="muted">Loading branding...</div>
        ) : (
          <div className="grid" style={{ gap: 14 }}>
            <OrganizationBrandBanner brand={previewBrand} />

            <div>
              <label className="label">Club or organization name</label>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit}
                placeholder="Your club name"
              />
            </div>

            <div>
              <label className="label">Logo URL</label>
              <input
                className="input"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                disabled={!canEdit}
                placeholder="https://example.com/logo.png"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <div>
                <label className="label">Primary color</label>
                <input
                  className="input"
                  type="color"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                  disabled={!canEdit}
                  style={{ minHeight: 56, padding: 8 }}
                />
              </div>

              <div>
                <label className="label">Accent color</label>
                <input
                  className="input"
                  type="color"
                  value={accentColor}
                  onChange={(event) => setAccentColor(event.target.value)}
                  disabled={!canEdit}
                  style={{ minHeight: 56, padding: 8 }}
                />
              </div>
            </div>

            <div
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,0.035)',
                color: 'rgba(255,255,255,0.72)',
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              DinkDraw remains visible as the tournament platform, while the club branding
              appears as the host identity.
            </div>

            <button
              type="button"
              className="button primary"
              onClick={saveBranding}
              disabled={!canEdit || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
