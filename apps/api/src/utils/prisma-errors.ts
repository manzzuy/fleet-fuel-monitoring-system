import { Prisma } from '@prisma/client';

import { AppError } from './errors';

const DB_NOT_MIGRATED_MESSAGE =
  'Database schema is missing required tables for onboarding. Run: cd apps/api && pnpm prisma migrate deploy';
const DB_NOT_MIGRATED_HINT = 'Then restart dev servers.';

function collectMessages(error: unknown): string[] {
  if (!error || typeof error !== 'object') {
    return [];
  }

  const messages: string[] = [];
  const stack = [error as Record<string, unknown>];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const message = current.message;
    if (typeof message === 'string') {
      messages.push(message);
    }

    const cause = current.cause;
    if (cause && typeof cause === 'object') {
      stack.push(cause as Record<string, unknown>);
    }
  }

  return messages;
}

export function isDbNotMigratedError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
    return true;
  }

  const combined = collectMessages(error).join('\n').toLowerCase();
  if (combined.length === 0) {
    return false;
  }

  return combined.includes('relation') && combined.includes('does not exist');
}

export function mapPrismaError(error: unknown): AppError | null {
  if (isDbNotMigratedError(error)) {
    return new AppError(503, 'db_not_migrated', DB_NOT_MIGRATED_MESSAGE, undefined, DB_NOT_MIGRATED_HINT);
  }

  return null;
}
