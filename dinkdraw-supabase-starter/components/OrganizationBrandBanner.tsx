export type OrganizationBrand = {
  id?: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
};

function isHexColor(value: string | null | undefined) {
  return !!value && /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

export function getOrganizationAccentColor(brand: OrganizationBrand | null | undefined) {
  return isHexColor(brand?.accent_color) ? brand!.accent_color!.trim() : '#FFCB05';
}

export function OrganizationBrandBanner({
  brand,
  compact = false,
}: {
  brand: OrganizationBrand | null | undefined;
  compact?: boolean;
}) {
  if (!brand?.name) return null;

  const primaryColor = isHexColor(brand.primary_color)
    ? brand.primary_color!.trim()
    : '#00274C';
  const accentColor = getOrganizationAccentColor(brand);
  const logoUrl = brand.logo_url?.trim();

  return (
    <section
      style={{
        marginBottom: compact ? 10 : 14,
        borderRadius: 18,
        padding: compact ? 10 : 12,
        border: `1px solid ${accentColor}55`,
        background: `linear-gradient(135deg, ${primaryColor}f0, rgba(0,20,40,0.92))`,
        boxShadow: '0 14px 36px rgba(0,0,0,0.24)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${brand.name} logo`}
              style={{
                width: compact ? 42 : 50,
                height: compact ? 42 : 50,
                borderRadius: 12,
                objectFit: 'contain',
                background: 'rgba(255,255,255,0.92)',
                padding: 5,
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: compact ? 42 : 50,
                height: compact ? 42 : 50,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: `${accentColor}22`,
                color: accentColor,
                border: `1px solid ${accentColor}55`,
                fontWeight: 950,
                fontSize: compact ? 18 : 22,
                flexShrink: 0,
              }}
            >
              {brand.name.trim()[0]?.toUpperCase() || 'C'}
            </div>
          )}

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 950,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: accentColor,
              }}
            >
              Hosted by
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: compact ? 18 : 22,
                lineHeight: 1.05,
                fontWeight: 950,
                color: '#fff',
                overflowWrap: 'anywhere',
              }}
            >
              {brand.name}
            </div>
          </div>
        </div>

        <div
          style={{
            flexShrink: 0,
            textAlign: 'right',
            fontSize: compact ? 10 : 11,
            lineHeight: 1.2,
            fontWeight: 900,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.72)',
          }}
        >
          Powered by
          <br />
          <span style={{ color: '#fff' }}>
            Dink<span style={{ color: '#FFCB05' }}>Draw</span>
          </span>
        </div>
      </div>
    </section>
  );
}
