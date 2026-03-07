import { expect, test } from '@playwright/test';

import { getTenantDriverBaseUrl, tryGetE2EDriverCredentials } from './helpers/credentials';

test('driver can complete and submit daily checklist from driver pwa', async ({ page }) => {
  const credentials = tryGetE2EDriverCredentials();

  test.skip(!credentials, 'Set E2E_DRIVER_USERNAME and E2E_DRIVER_PASSWORD to run driver checklist smoke.');

  const baseUrl = getTenantDriverBaseUrl();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('driver-login-form')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('textbox', { name: 'Username' }).fill(credentials!.username);
  await page.getByRole('textbox', { name: 'Password' }).fill(credentials!.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId('driver-open-daily-checklist').click();
  await expect(page).toHaveURL(/\/daily-checks$/);

  const items = page.locator('[data-testid^="driver-checklist-item-"]');
  await expect(items.first()).toBeVisible();
  const itemCount = await items.count();
  for (let index = 0; index < itemCount; index += 1) {
    await items.nth(index).getByRole('button', { name: 'OK', exact: true }).click();
  }

  await page.getByTestId('driver-submit-daily-checklist').click();
  await expect(page.getByTestId('driver-checklist-submit-success')).toBeVisible();
});
