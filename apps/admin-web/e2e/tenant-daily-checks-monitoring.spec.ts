import { expect, test } from '@playwright/test';

import { loginTenantAdmin } from './helpers/login';

test('daily checks monitoring page exposes issue-focused filters and stable table rendering', async ({ page }) => {
  await loginTenantAdmin(page);

  await page.getByTestId('nav-daily-checks').click();
  await expect(page).toHaveURL(/\/daily-checks$/);
  await expect(page.getByTestId('daily-checks-monitoring-module')).toBeVisible();

  await expect(page.getByText('Issues only')).toBeVisible();
  await expect(page.getByText('Critical only')).toBeVisible();
  await expect(page.getByText('Repeated vehicle issues')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Issues only' }).check();
  await page.getByRole('checkbox', { name: 'Critical only' }).check();
  await page.getByRole('checkbox', { name: 'Repeated vehicle issues' }).check();

  await expect(page.getByText(/route not found/i)).toHaveCount(0);
  await expect(page.getByTestId('daily-checks-monitoring-module')).toBeVisible();
});
