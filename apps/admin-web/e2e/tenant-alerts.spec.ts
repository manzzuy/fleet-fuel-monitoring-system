import { expect, test } from '@playwright/test';

import { loginTenantAdmin } from './helpers/login';

test('tenant alerts screen renders summary, table states, and filters', async ({ page }) => {
  await loginTenantAdmin(page);

  await page.getByTestId('nav-alerts').click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(page.getByTestId('alerts-monitoring-module')).toBeVisible();

  await expect(page.getByTestId('alerts-summary-missing-checks')).toBeVisible();
  await expect(page.getByTestId('alerts-summary-checklist-issues')).toBeVisible();
  await expect(page.getByTestId('alerts-summary-fuel-today')).toBeVisible();
  await expect(page.getByTestId('alerts-summary-high-priority')).toBeVisible();

  const rows = page.getByTestId('alerts-row');
  const emptyState = page.getByTestId('alerts-empty-state');
  const initialRows = await rows.count();

  if (initialRows === 0) {
    await expect(emptyState).toBeVisible();
  } else {
    await expect(rows.first()).toBeVisible();
  }

  await page.getByTestId('alerts-filter-severity').selectOption('HIGH');
  await page.getByTestId('alerts-filter-type').selectOption('suspicious_high_liters');
  await page.getByTestId('alerts-filter-date').fill(new Date().toISOString().slice(0, 10));

  await page.waitForTimeout(300);
  const filteredRows = await rows.count();
  if (filteredRows === 0) {
    await expect(emptyState).toBeVisible();
  } else {
    await expect(rows.first()).toBeVisible();
    const firstRowText = (await rows.first().innerText()).toLowerCase();
    expect(firstRowText.includes('high')).toBe(true);
  }

  await page.getByTestId('alerts-filter-severity').selectOption('');
  await page.getByTestId('alerts-filter-type').selectOption('');
  const actionableRows = await rows.count();
  if (actionableRows > 0) {
    const firstRowType = ((await rows.first().locator('span').nth(1).innerText()) ?? '').toLowerCase();
    const firstHref = (await rows.first().getByRole('link').first().getAttribute('href')) ?? '';
    if (firstRowType.includes('fuel')) {
      expect(firstHref).toContain('/fuel?');
    } else {
      expect(firstHref).toContain('/daily-checks');
    }

    await rows.first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/(fuel|daily-checks)(\/|$|\?)/);
    await expect(page.getByText(/route not found/i)).toHaveCount(0);
  }
});
