import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/fleet_fuel_platform?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET ??= 'test-secret-with-minimum-length';

let getEffectiveHost: (host: string | null | undefined, forwardedHost?: string | string[]) => string | null;

beforeAll(async () => {
  ({ getEffectiveHost } = await import('./tenant.service'));
});

describe('getEffectiveHost', () => {
  it('prefers forwarded host when present', () => {
    expect(getEffectiveHost('localhost:5001', 'maqshan.platform.test')).toBe('maqshan.platform.test');
  });

  it('falls back to the host header', () => {
    expect(getEffectiveHost('maqshan.platform.test:5001')).toBe('maqshan.platform.test');
  });
});
