type SiteLabelInput = {
  site_name?: string | null;
  site_code?: string | null;
};

function normalizeUpper(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
}

export function formatSiteDisplayName(site: SiteLabelInput | null | undefined) {
  return normalizeUpper(site?.site_name) ?? normalizeUpper(site?.site_code) ?? '—';
}

export function formatFleetCode(value: string | null | undefined) {
  return normalizeUpper(value) ?? '—';
}
