import { expect, test } from '@playwright/test';

import { getTenantDriverBaseUrl, tryGetE2EDriverCredentials } from './helpers/credentials';

test('driver can submit fuel entry and gets validation for missing approved-source context', async ({ page }) => {
  const credentials = tryGetE2EDriverCredentials();
  test.skip(!credentials, 'Set E2E_DRIVER_USERNAME and E2E_DRIVER_PASSWORD to run driver fuel smoke.');

  const baseUrl = getTenantDriverBaseUrl();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('driver-login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Username' }).fill(credentials!.username);
  await page.getByRole('textbox', { name: 'Password' }).fill(credentials!.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId('driver-open-fuel-entry').click();
  await expect(page).toHaveURL(/\/fuel-entry$/);

  await expect(page.getByTestId('driver-fuel-form')).toBeVisible();
  await page.getByTestId('driver-fuel-source-type').selectOption('approved_source');
  await page.getByTestId('driver-fuel-liters').fill('25');
  await page.getByTestId('driver-fuel-odometer').fill('120500');
  await page.getByTestId('driver-submit-fuel-entry').click();
  await expect(page.getByTestId('driver-fuel-error')).toContainText('Approved source context is required.');

  await page.getByTestId('driver-fuel-approved-context').fill('Remote approved mobile tanker');
  await page.getByTestId('driver-fuel-odometer').fill('');
  await page.getByTestId('driver-fuel-odometer-fallback-toggle').check();
  await page.getByTestId('driver-submit-fuel-entry').click();
  await expect(page.getByTestId('driver-fuel-error')).toContainText('Fallback reason is required');

  await page.getByTestId('driver-fuel-odometer-fallback-reason').fill('Odometer was unreadable due to glare');
  await page.getByTestId('driver-submit-fuel-entry').click();
  await expect(page.getByTestId('driver-fuel-submit-success')).toBeVisible();
});
