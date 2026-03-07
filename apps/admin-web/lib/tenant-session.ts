export function getTenantTokenKey(subdomain: string) {
  return `tenant_staff_access_token:${subdomain}`;
}
