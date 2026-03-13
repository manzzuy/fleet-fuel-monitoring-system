import { expect, test, type Page } from '@playwright/test';

import { getTenantDriverBaseUrl, tryGetE2EDriverCredentials } from './helpers/credentials';

async function loginAndOpenChecklist(page: Page) {
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
}

async function firstInteractiveChecklistCard(page: Page) {
  const items = page.locator('[data-testid^="driver-checklist-item-"]');
  await expect(items.first()).toBeVisible();
  const itemCount = await items.count();

  for (let index = 0; index < itemCount; index += 1) {
    const item = items.nth(index);
    const issueButton = item.getByRole('button', { name: /ISSUE/i });
    if ((await issueButton.isVisible()) && (await issueButton.isEnabled())) {
      return item;
    }
  }

  throw new Error('No interactive checklist item found.');
}

async function fillChecklistOdometer(page: Page) {
  const previousText = (await page.getByTestId('driver-checklist-previous-odometer').textContent()) ?? '';
  const previousMatch = previousText.match(/(\d[\d,]*)\s*km/i);
  const baselineRaw = previousMatch?.[1] ?? '';
  const baseline = baselineRaw ? Number(baselineRaw.replace(/,/g, '')) : 0;
  await page.getByTestId('driver-checklist-odometer').fill(String(Math.max(1, baseline + 1)));
}

test('driver checklist issue interaction shows and hides issue-only fields', async ({ page }) => {
  await loginAndOpenChecklist(page);

  const item = await firstInteractiveChecklistCard(page);
  await item.getByRole('button', { name: /ISSUE/i }).click();

  const issueNote = page.locator('[data-testid^="driver-checklist-issue-note-"]');
  await expect(issueNote).toBeVisible();
  await issueNote.fill('Mirror cracked');

  const photoInput = page.locator('[data-testid^="driver-checklist-issue-photo-"]');
  await photoInput.setInputFiles({
    name: 'issue.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('driver checklist issue photo'),
  });
  await expect(page.getByText('issue.jpg')).toBeVisible();

  await page.getByRole('button', { name: /save defect/i }).click();

  await item.getByRole('button', { name: /PASS/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('driver checklist validates required completion and restores saved draft', async ({ page }) => {
  await loginAndOpenChecklist(page);

  await expect(page.getByTestId('driver-submit-daily-checklist')).toBeDisabled();
  await expect(page.getByTestId('driver-checklist-sticky-submit')).toContainText('checks remaining');

  const item = await firstInteractiveChecklistCard(page);
  await item.getByRole('button', { name: /ISSUE/i }).click();
  const issueNote = page.locator('[data-testid^="driver-checklist-issue-note-"]');
  await issueNote.fill('Draft restore note');
  await page.getByRole('button', { name: /save defect/i }).click();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('driver-checklist-draft-restored')).toBeVisible();
  const restoredItem = await firstInteractiveChecklistCard(page);
  await restoredItem.getByRole('button', { name: /ISSUE/i }).click();
  await expect(page.locator('[data-testid^="driver-checklist-issue-note-"]').first()).toHaveValue('Draft restore note');
});

test('driver checklist allows ISSUE without notes or photo and still submits', async ({ page }) => {
  await loginAndOpenChecklist(page);

  const item = await firstInteractiveChecklistCard(page);
  await item.getByRole('button', { name: /ISSUE/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /cancel/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByTestId('driver-checklist-pass-Mechanical & Exterior:indicators').click();
  await page.getByTestId('driver-checklist-pass-Mechanical & Exterior:tyres').click();
  await page.getByTestId('driver-checklist-pass-Safety & Emergency:brakes').click();
  await fillChecklistOdometer(page);

  await expect(page.getByTestId('driver-submit-daily-checklist')).toBeEnabled();
  await page.getByTestId('driver-submit-daily-checklist').click();
  await expect(page.getByTestId('driver-checklist-submit-success')).toBeVisible();
});

test('driver checklist paper ux keeps progress and mobile-safe layout', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await loginAndOpenChecklist(page);

  await expect(page.getByTestId('driver-checklist-progress-header')).toBeVisible();
  await expect(page.getByTestId('driver-checklist-sticky-submit')).toBeVisible();
  await expect(page.getByTestId('driver-checklist-vehicle-odometer-row')).toBeVisible();
  await expect(page.getByTestId('driver-checklist-previous-odometer')).toContainText('Previous:');

  const items = page.locator('[data-testid^="driver-checklist-item-"]');
  const beforeCount = await items.count();
  const item = await firstInteractiveChecklistCard(page);

  await item.getByRole('button', { name: /ISSUE/i }).click();
  await expect(page.getByTestId('driver-checklist-progress-header')).toContainText('Issues: 1');
  await expect(page.getByTestId('driver-checklist-sticky-submit')).toContainText('1 issues');

  const itemCountAfterIssue = await items.count();
  expect(itemCountAfterIssue).toBe(beforeCount);
  await expect(page.getByRole('button', { name: /expand all/i })).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBeFalsy();
  expect(consoleErrors).toEqual([]);
});

test('driver can complete and submit daily checklist from driver pwa', async ({ page }) => {
  await loginAndOpenChecklist(page);

  const items = page.locator('[data-testid^="driver-checklist-item-"]');
  await expect(items.first()).toBeVisible();
  const itemCount = await items.count();
  for (let index = 0; index < itemCount; index += 1) {
    const passButton = items.nth(index).getByRole('button', { name: /PASS/i });
    if ((await passButton.isVisible()) && (await passButton.isEnabled())) {
      await passButton.click();
    } else {
      const okButton = items.nth(index).getByRole('button', { name: 'OK', exact: true });
      if ((await okButton.isVisible()) && (await okButton.isEnabled())) {
        await okButton.click();
      }
    }
  }
  await fillChecklistOdometer(page);

  await page.getByTestId('driver-submit-daily-checklist').click();
  await expect(page.getByTestId('driver-checklist-submit-success')).toBeVisible();
});
