import { type OrganizationBrand } from '../components/OrganizationBrandBanner';

export async function loadPublicOrganizationBrand(
  supabase: any,
  organizationId: string | null | undefined
): Promise<OrganizationBrand | null> {
  if (!organizationId) return null;

  const { data, error } = await supabase.rpc('get_public_organization_brand', {
    p_organization_id: organizationId,
  });

  if (error) {
    console.error('Failed to load organization branding:', error);
    return null;
  }

  const brand = Array.isArray(data) ? data[0] : data;
  return brand || null;
}
