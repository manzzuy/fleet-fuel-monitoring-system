import { expect, test } from '@playwright/test';

import { loginTenantAdmin } from './helpers/login';

test('tenant admin can sign in to the local dashboard using env credentials', async ({ page }) => {
  await loginTenantAdmin(page);
  await expect(page.getByRole('heading', { name: /operations/i })).toBeVisible();
});
