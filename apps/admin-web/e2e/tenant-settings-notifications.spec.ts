import { expect, test } from '@playwright/test';

import { loginTenantAdmin } from './helpers/login';
import { getTenantAdminBaseUrl } from './helpers/credentials';

test('tenant settings shows notifications section', async ({ page }) => {
  await loginTenantAdmin(page);
  await page.goto(`${getTenantAdminBaseUrl()}/settings`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('settings-monitoring-module')).toBeVisible();
  await expect(page.getByTestId('settings-system-status-module')).toBeVisible();
  await expect(page.getByTestId('settings-notifications-module')).toBeVisible();
  await expect(page.getByTestId('settings-notification-preview-module')).toBeVisible();
  await expect(page.getByText(/provider integration is not yet active/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /save notification settings/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /refresh preview/i })).toBeVisible();
});
