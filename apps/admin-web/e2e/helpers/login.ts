import { expect, type Page } from '@playwright/test';

import { getE2ECredentials, getTenantAdminBaseUrl } from './credentials';

export async function loginTenantAdmin(page: Page) {
  const credentials = getE2ECredentials();
  const baseUrl = getTenantAdminBaseUrl();
  const identifier = credentials.username || credentials.email;

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByTestId('tenant-login-form')).toHaveAttribute('data-hydrated', 'true');

  const identifierInput = page.getByRole('textbox', { name: 'Email or username' });
  const passwordInput = page.getByRole('textbox', { name: 'Password' });

  await identifierInput.fill(identifier);
  await passwordInput.fill(credentials.password);
  await expect(identifierInput).toHaveValue(identifier);
  await expect(passwordInput).toHaveValue(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
