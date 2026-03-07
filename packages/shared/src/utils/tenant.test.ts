import { describe, expect, it } from 'vitest';

import { extractTenantSubdomain } from './tenant';

describe('extractTenantSubdomain', () => {
  it('returns the first tenant label for a valid platform host', () => {
    expect(extractTenantSubdomain('maqshan.platform.test', 'platform.test')).toBe('maqshan');
  });

  it('strips the port before checking the host', () => {
    expect(extractTenantSubdomain('maqshan.platform.test:3000', 'platform.test')).toBe('maqshan');
  });

  it('rejects localhost and naked platform hosts', () => {
    expect(extractTenantSubdomain('localhost:3000', 'platform.test')).toBeNull();
    expect(extractTenantSubdomain('platform.test', 'platform.test')).toBeNull();
  });

  it('rejects nested subdomains to keep tenant routing explicit', () => {
    expect(extractTenantSubdomain('foo.bar.platform.test', 'platform.test')).toBeNull();
  });
});
