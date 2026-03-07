import { expect, test } from '@playwright/test';

import { loginTenantAdmin } from './helpers/login';

const pageChecks: Array<{ route: string; navTestId: string; moduleTestId: string; heading: RegExp }> = [
  { route: '/dashboard', navTestId: 'nav-dashboard', moduleTestId: 'dashboard-shell', heading: /operations/i },
  { route: '/fuel', navTestId: 'nav-fuel', moduleTestId: 'fuel-monitoring-module', heading: /fuel monitoring/i },
  {
    route: '/daily-checks',
    navTestId: 'nav-daily-checks',
    moduleTestId: 'daily-checks-monitoring-module',
    heading: /daily checks monitoring/i,
  },
  { route: '/drivers', navTestId: 'nav-drivers', moduleTestId: 'drivers-monitoring-module', heading: /drivers monitoring/i },
  {
    route: '/vehicles',
    navTestId: 'nav-vehicles',
    moduleTestId: 'vehicles-monitoring-module',
    heading: /vehicles monitoring/i,
  },
  { route: '/sites', navTestId: 'nav-sites', moduleTestId: 'sites-monitoring-module', heading: /sites monitoring/i },
  { route: '/tanks', navTestId: 'nav-tanks', moduleTestId: 'tanks-monitoring-module', heading: /tanks monitoring/i },
  {
    route: '/settings',
    navTestId: 'nav-settings',
    moduleTestId: 'settings-monitoring-module',
    heading: /^settings$/i,
  },
];

test('phase 2 admin regression smoke: tenant shell and module routes are stable', async ({ page }) => {
  await loginTenantAdmin(page);

  await expect(page.getByTestId('tenant-sidebar')).toBeVisible();
  await expect(page.getByTestId('tenant-sidebar-nav')).toBeVisible();

  for (const check of pageChecks) {
    await page.getByTestId(check.navTestId).click();
    await expect(page).toHaveURL(new RegExp(`${check.route.replace('/', '\\/')}$`));
    await expect(page.getByTestId(check.moduleTestId)).toBeVisible();
    await expect(page.getByRole('heading', { name: check.heading })).toBeVisible();
    await expect(page.getByText(/route not found/i)).toHaveCount(0);
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  }
});
