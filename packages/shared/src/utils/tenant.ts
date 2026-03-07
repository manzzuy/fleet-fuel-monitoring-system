const TENANT_LABEL_REGEX = /^[a-z0-9-]+$/;

export function normalizeHost(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  const first = input.split(',')[0]?.trim().toLowerCase();

  if (!first) {
    return null;
  }

  return first.replace(/:\d+$/, '');
}

export function extractTenantSubdomain(
  rawHost: string | null | undefined,
  platformBaseDomain: string,
): string | null {
  const host = normalizeHost(rawHost);
  const base = platformBaseDomain.trim().toLowerCase();

  if (!host || !base) {
    return null;
  }

  if (host === 'localhost' || host === '127.0.0.1' || host === base) {
    return null;
  }

  const suffix = `.${base}`;

  if (!host.endsWith(suffix)) {
    return null;
  }

  const candidate = host.slice(0, -suffix.length);

  if (!candidate || candidate.includes('.') || !TENANT_LABEL_REGEX.test(candidate)) {
    return null;
  }

  return candidate;
}
