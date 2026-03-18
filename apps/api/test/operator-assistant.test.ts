import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { PlatformUserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

const app = createApp();

async function loginPlatformOwner() {
  await prisma.platformUser.upsert({
    where: {
      email: process.env.PLATFORM_OWNER_EMAIL!,
    },
    update: {
      role: PlatformUserRole.PLATFORM_OWNER,
      passwordHash: await hashPassword(process.env.PLATFORM_OWNER_PASSWORD!),
    },
    create: {
      email: process.env.PLATFORM_OWNER_EMAIL!,
      role: PlatformUserRole.PLATFORM_OWNER,
      passwordHash: await hashPassword(process.env.PLATFORM_OWNER_PASSWORD!),
    },
  });

  const login = await request(app).post('/auth/platform-login').send({
    email: process.env.PLATFORM_OWNER_EMAIL,
    password: process.env.PLATFORM_OWNER_PASSWORD,
  });

  expect(login.status).toBe(200);
  return login.body.access_token as string;
}

describe('Platform operator assistant', () => {
  it('requires platform auth', async () => {
    const response = await request(app).post('/platform/operator/assist').send({
      question: 'Why did tenant onboarding fail?',
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: {
        code: 'missing_auth',
      },
    });
  });

  it('returns structured troubleshooting output for supported onboarding questions', async () => {
    const token = await loginPlatformOwner();

    const response = await request(app)
      .post('/platform/operator/assist')
      .set('authorization', `Bearer ${token}`)
      .send({
        question: 'Why did tenant onboarding fail for Maqshan workbook import?',
        tenant_subdomain: 'maqshan',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      question_type: 'onboarding_failure',
      likely_cause: expect.any(String),
      affected_services: expect.arrayContaining(['api', 'database']),
      likely_modules: expect.arrayContaining(['apps/api/src/services/onboarding.service.ts']),
      next_checks: expect.any(Array),
      risk_level: 'high',
      confidence: expect.stringMatching(/^(low|medium|high)$/),
      uncertain: expect.any(Boolean),
      status_snapshot: {
        api: 'assumed_healthy',
        database: expect.stringMatching(/^(reachable|unreachable)$/),
      },
      request_id: expect.any(String),
    });
    expect(Array.isArray(response.body.evidence)).toBe(true);
  });

  it('falls back to general classification for unclear questions', async () => {
    const token = await loginPlatformOwner();

    const response = await request(app)
      .post('/platform/operator/assist')
      .set('authorization', `Bearer ${token}`)
      .send({
        question: 'What should I look at first?',
      });

    expect(response.status).toBe(200);
    expect(response.body.question_type).toBe('general');
    expect(response.body.uncertain).toBe(true);
    expect(response.body.next_checks.length).toBeGreaterThan(0);
  });
});
