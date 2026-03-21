export function driverTokenKey(subdomain: string) {
  return `fleetfuel.driver.token.${subdomain}`;
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isForcePasswordChangeToken(token: string) {
  const payload = decodeJwtPayload(token);
  return payload?.force_password_change === true;
}

export function buildDriverTenantLoginPath(subdomain: string | null | undefined) {
  if (!subdomain) {
    return '/';
  }
  return `/?tenant=${encodeURIComponent(subdomain)}`;
}
