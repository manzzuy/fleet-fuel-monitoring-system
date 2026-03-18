import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  OperatorAssistantEvidence,
  OperatorAssistantRequest,
  OperatorAssistantResponse,
  OperatorQuestionType,
} from '@fleet-fuel/shared';

import { prisma } from '../db/prisma';

type ServiceName = OperatorAssistantResponse['affected_services'][number];

interface SourceDoc {
  key: string;
  title: string;
  relativePath: string;
}

interface LoadedDoc extends SourceDoc {
  content: string;
}

const SOURCE_DOCS: SourceDoc[] = [
  {
    key: 'platform-state',
    title: 'Platform State',
    relativePath: 'docs/system-memory/platform-state.md',
  },
  {
    key: 'architecture-decisions',
    title: 'Architecture Decisions',
    relativePath: 'docs/system-memory/architecture-decisions.md',
  },
  {
    key: 'ui-decisions',
    title: 'UI Decisions',
    relativePath: 'docs/system-memory/ui-decisions.md',
  },
  {
    key: 'deployment-history',
    title: 'Deployment History',
    relativePath: 'docs/system-memory/deployment-history.md',
  },
  {
    key: 'known-issues',
    title: 'Known Issues',
    relativePath: 'docs/system-memory/known-issues.md',
  },
  {
    key: 'checklist-evolution',
    title: 'Checklist Evolution',
    relativePath: 'docs/system-memory/checklist-evolution.md',
  },
  {
    key: 'onboarding-evolution',
    title: 'Onboarding Evolution',
    relativePath: 'docs/system-memory/onboarding-evolution.md',
  },
  {
    key: 'dashboard-evolution',
    title: 'Dashboard Evolution',
    relativePath: 'docs/system-memory/dashboard-evolution.md',
  },
  {
    key: 'system-health',
    title: 'System Health',
    relativePath: 'docs/system-memory/system-health.md',
  },
];

const INTENT_CONFIG: Record<
  OperatorQuestionType,
  {
    services: ServiceName[];
    modules: string[];
    risk: OperatorAssistantResponse['risk_level'];
    docs: string[];
    likelyCause: string;
    nextChecks: string[];
  }
> = {
  onboarding_failure: {
    services: ['api', 'admin-web', 'database'],
    modules: [
      'apps/api/src/routes/platform.ts',
      'apps/api/src/services/onboarding.service.ts',
      'apps/api/src/modules/onboarding/validators.ts',
      'apps/admin-web/components/platform-console.tsx',
    ],
    risk: 'high',
    docs: ['onboarding-evolution', 'known-issues', 'system-health', 'deployment-history'],
    likelyCause:
      'Onboarding failures are usually caused by workbook validation errors, migration readiness gaps, or stale tenant data from manual staging edits.',
    nextChecks: [
      'Run onboarding preflight and confirm DB readiness before upload.',
      'Review workbook preview errors by sheet/row/column and correct input file first.',
      'Check onboarding API logs for request_id and validation/internal error code.',
      'Confirm tenant was created through official flow, not manual DB inserts.',
    ],
  },
  driver_vehicle_visibility: {
    services: ['api', 'driver-pwa', 'database'],
    modules: [
      'apps/api/src/routes/driver.ts',
      'apps/api/src/services/driver.service.ts',
      'apps/api/src/services/data-scope.service.ts',
      'apps/driver-pwa/components/driver-dashboard.tsx',
    ],
    risk: 'high',
    docs: ['architecture-decisions', 'known-issues', 'system-health'],
    likelyCause:
      'Driver vehicle visibility issues are usually tenant/scope mismatch, missing assignment mapping, or tenant context loss in request routing.',
    nextChecks: [
      'Verify driver profile has assigned vehicle and site in tenant-scoped tables.',
      'Confirm request uses correct tenant host/query override and token tenant matches.',
      'Check driver dashboard API response payload for assignment fields.',
      'Inspect recent master-data edits affecting driver/vehicle assignment.',
    ],
  },
  missing_daily_checks_zero: {
    services: ['api', 'admin-web', 'database'],
    modules: [
      'apps/api/src/services/dashboard.service.ts',
      'apps/api/src/services/alerts.service.ts',
      'apps/admin-web/components/tenant-dashboard-shell.tsx',
    ],
    risk: 'high',
    docs: ['dashboard-evolution', 'known-issues', 'system-health', 'architecture-decisions'],
    likelyCause:
      'A zero missing-daily-check value is typically caused by dashboard aggregation filters, date-range anchor mismatch, or scope-limited visibility.',
    nextChecks: [
      'Validate dashboard summary query date range and timezone assumptions.',
      'Compare KPI output with raw daily check submissions for the same tenant and date window.',
      'Confirm role/site scope for current user is not filtering expected vehicles.',
      'Inspect recent dashboard summary changes and deployment diff.',
    ],
  },
  last_deployment_changes: {
    services: ['deployment', 'api', 'admin-web', 'driver-pwa'],
    modules: [
      'docs/system-memory/deployment-history.md',
      'docs/system-memory/system-health.md',
      'scripts/ops/deploy-and-verify.sh',
    ],
    risk: 'medium',
    docs: ['deployment-history', 'system-health', 'platform-state'],
    likelyCause:
      'Recent issues are often related to deployment queue lag, env drift, or service-specific redeploy gaps rather than code defects alone.',
    nextChecks: [
      'Inspect latest deployment history entries and service-specific commit hashes.',
      'Confirm env alignment across API/admin/driver services.',
      'Re-run health endpoints and live Playwright verification after deploy.',
    ],
  },
  known_issue_check: {
    services: ['deployment', 'api', 'admin-web', 'driver-pwa'],
    modules: [
      'docs/system-memory/known-issues.md',
      'docs/system-memory/system-health.md',
    ],
    risk: 'medium',
    docs: ['known-issues', 'system-health', 'deployment-history'],
    likelyCause:
      'The reported symptom may already match a documented recurring issue pattern in staging operations or tenant routing constraints.',
    nextChecks: [
      'Match symptom against known issue IDs and current workaround.',
      'Confirm whether a fix is code-related or environment/deployment related.',
      'If known issue, apply documented workaround and verify live behavior.',
    ],
  },
  service_inspection_priority: {
    services: ['api', 'admin-web', 'driver-pwa', 'deployment'],
    modules: [
      'apps/api/src/routes',
      'apps/admin-web/lib/api.ts',
      'apps/driver-pwa/lib',
      'docs/system-memory/deployment-history.md',
    ],
    risk: 'medium',
    docs: ['system-health', 'known-issues', 'deployment-history', 'platform-state'],
    likelyCause:
      'Service inspection priority depends on whether symptom is transport/connectivity, tenant routing, data integrity, or UI rendering.',
    nextChecks: [
      'Start with API health + logs when symptom includes fetch/500/auth errors.',
      'Inspect frontend runtime/env when symptom is UI-only with healthy API.',
      'Inspect deployment and config if behavior differs between local and live.',
      'Inspect data/config tables if only one tenant or role is affected.',
    ],
  },
  general: {
    services: ['api', 'admin-web', 'driver-pwa'],
    modules: ['docs/system-memory/platform-state.md', 'docs/system-memory/system-health.md'],
    risk: 'low',
    docs: ['platform-state', 'system-health', 'known-issues'],
    likelyCause:
      'Insufficient issue detail to isolate root cause. This looks like a cross-surface troubleshooting request.',
    nextChecks: [
      'Provide exact URL, role, tenant, and failing request/response details.',
      'Capture request_id and service logs around failure timestamp.',
      'Run health and a focused Playwright reproduction path.',
    ],
  },
};

let docsCache: { loadedAt: number; docs: LoadedDoc[] } | null = null;

function resolveRepoPath(relativePath: string) {
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, '..'), path.resolve(cwd, '..', '..')];
  for (const base of candidates) {
    const absolute = path.resolve(base, relativePath);
    if (existsSync(absolute)) {
      return absolute;
    }
  }
  return path.resolve(cwd, relativePath);
}

async function loadDocs(): Promise<LoadedDoc[]> {
  if (docsCache && Date.now() - docsCache.loadedAt < 30_000) {
    return docsCache.docs;
  }

  const docs = await Promise.all(
    SOURCE_DOCS.map(async (source) => {
      const absolutePath = resolveRepoPath(source.relativePath);
      const content = await fs.readFile(absolutePath, 'utf-8').catch(() => '');
      return {
        ...source,
        content,
      };
    }),
  );
  docsCache = { loadedAt: Date.now(), docs };
  return docs;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function tokenize(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function inferQuestionType(question: string): OperatorQuestionType {
  const normalized = normalizeText(question);

  if (normalized.includes('onboarding') && (normalized.includes('fail') || normalized.includes('error'))) {
    return 'onboarding_failure';
  }
  if (normalized.includes('driver') && normalized.includes('vehicle') && (normalized.includes('not seeing') || normalized.includes('missing'))) {
    return 'driver_vehicle_visibility';
  }
  if (normalized.includes('missing daily checks') && (normalized.includes('0') || normalized.includes('zero'))) {
    return 'missing_daily_checks_zero';
  }
  if ((normalized.includes('last deployment') || normalized.includes('what changed')) && normalized.includes('deploy')) {
    return 'last_deployment_changes';
  }
  if (normalized.includes('known issue')) {
    return 'known_issue_check';
  }
  if (
    normalized.includes('which service') ||
    normalized.includes('service should i inspect') ||
    normalized.includes('inspect first')
  ) {
    return 'service_inspection_priority';
  }
  return 'general';
}

function scoreLine(line: string, tokens: string[]) {
  const text = normalizeText(line);
  return tokens.reduce((score, token) => (text.includes(token) ? score + 1 : score), 0);
}

function extractEvidence(
  docs: LoadedDoc[],
  question: string,
  questionType: OperatorQuestionType,
): OperatorAssistantEvidence[] {
  const config = INTENT_CONFIG[questionType];
  const tokens = [...new Set([...tokenize(question), ...tokenize(config.likelyCause)])];
  const preferredDocKeys = new Set(config.docs);

  const ranked: Array<OperatorAssistantEvidence & { score: number }> = [];
  for (const doc of docs) {
    if (doc.content.length === 0) {
      continue;
    }
    const lines = doc.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 18 || trimmed.length > 220) {
        return;
      }
      if (!trimmed.startsWith('-') && !trimmed.startsWith('##') && !trimmed.startsWith('###')) {
        return;
      }
      const score = scoreLine(trimmed, tokens) + (preferredDocKeys.has(doc.key) ? 2 : 0);
      if (score < 2) {
        return;
      }
      ranked.push({
        source: doc.title,
        path: doc.relativePath,
        excerpt: trimmed.replace(/^[-#\s]+/, ''),
        score,
      });
      if (index > 220) {
        return;
      }
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  const dedup = new Set<string>();
  const results: OperatorAssistantEvidence[] = [];
  for (const entry of ranked) {
    const key = `${entry.path}:${entry.excerpt}`;
    if (dedup.has(key)) {
      continue;
    }
    dedup.add(key);
    results.push({
      source: entry.source,
      path: entry.path,
      excerpt: entry.excerpt,
    });
    if (results.length >= 6) {
      break;
    }
  }
  return results;
}

function extractHeadings(content: string, prefix: string, limit: number) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith(prefix))
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .slice(0, limit);
}

async function getStatusSnapshot(): Promise<OperatorAssistantResponse['status_snapshot']> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      api: 'assumed_healthy',
      database: 'reachable',
    };
  } catch {
    return {
      api: 'assumed_healthy',
      database: 'unreachable',
    };
  }
}

export async function askOperatorAssistant(
  payload: OperatorAssistantRequest,
  requestId: string,
): Promise<OperatorAssistantResponse> {
  const question = payload.question.trim();
  const questionType = inferQuestionType(question);
  const config = INTENT_CONFIG[questionType];
  const docs = await loadDocs();
  const evidence = extractEvidence(docs, question, questionType);
  const knownIssues = extractHeadings(docs.find((doc) => doc.key === 'known-issues')?.content ?? '', '## ', 5);
  const deploymentChanges = extractHeadings(docs.find((doc) => doc.key === 'deployment-history')?.content ?? '', '## ', 5);
  const statusSnapshot = await getStatusSnapshot();

  const confidence: OperatorAssistantResponse['confidence'] =
    evidence.length >= 4 ? 'high' : evidence.length >= 2 ? 'medium' : 'low';

  const uncertain = questionType === 'general' || confidence === 'low';

  return {
    question,
    question_type: questionType,
    likely_cause: config.likelyCause,
    evidence,
    affected_services: config.services,
    likely_modules: config.modules,
    known_previous_incidents: knownIssues,
    recent_relevant_changes: deploymentChanges,
    next_checks: config.nextChecks,
    risk_level: config.risk,
    confidence,
    uncertain,
    status_snapshot: statusSnapshot,
    request_id: requestId,
  };
}
