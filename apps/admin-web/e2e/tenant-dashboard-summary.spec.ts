import { expect, test } from '@playwright/test';

import { loginTenantAdmin } from './helpers/login';

test('tenant dashboard surfaces actionable monitoring cards and panels', async ({ page }) => {
  await loginTenantAdmin(page);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('dashboard-shell')).toBeVisible();
  await expect(page.getByTestId('dashboard-monitoring-summary')).toBeVisible();
  await expect(page.getByTestId('dashboard-kpi-row')).toBeVisible();
  await expect(page.getByTestId('dashboard-compact-sections')).toBeVisible();
  await expect(page.getByTestId('dashboard-needs-attention')).toBeVisible();
  await expect(page.getByTestId('dashboard-compliance-watchlist')).toBeVisible();

  await expect(page.getByText(/missing daily checks/i)).toBeVisible();
  await expect(page.getByText(/high-risk fuel alerts/i)).toBeVisible();
  await expect(page.getByText(/compliance expired/i)).toBeVisible();
  await expect(page.getByText(/compliance expiring soon/i)).toBeVisible();
  await expect(page.getByText(/receipt gaps/i)).toBeVisible();

  const needsAttentionList = page.getByTestId('dashboard-needs-attention-list');
  const needsAttentionEmpty = page.getByTestId('dashboard-needs-attention-empty');
  const hasNeedsAttentionRows = (await needsAttentionList.count()) > 0;
  if (hasNeedsAttentionRows) {
    await expect(needsAttentionList).toBeVisible();
    await needsAttentionList.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/(alerts|fuel|daily-checks)(\/|$|\?)/);
  } else {
    await expect(needsAttentionEmpty).toBeVisible();
  }

  await page.goto(new URL('/dashboard', page.url()).toString());
  await page.getByTestId('dashboard-needs-attention').getByRole('link', { name: /open high-priority alerts/i }).click();
  await expect(page).toHaveURL(/\/alerts(\?|$)/);
});
