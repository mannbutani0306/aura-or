import { expect, test } from '@playwright/test';

test('provenance keyboard access and Pulse default-off state', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('aura_intro_shown', 'true'));
  await page.goto('/#/command', { waitUntil: 'domcontentloaded' });
  const provenanceButton = page.getByRole('button', { name: 'Data provenance' });
  await expect(provenanceButton).toBeVisible();
  await page.keyboard.type('?');
  await expect(page.getByRole('region', { name: 'Data provenance' })).toBeVisible();
  await expect(page.getByText('Workbook sheet: dummy_ambulance_data')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Data provenance' })).toBeHidden();

  await page.getByRole('button', { name: 'Pulse controls' }).click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  const response = await page.request.get('/api/pulse');
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).running).toBe(false);
});

test('command palette keyboard navigation', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('aura_intro_shown', 'true'));
  await page.goto('/#/command', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Search commands' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  const input = palette.locator('input');
  await input.fill('Road network');
  await input.press('Enter');
  await expect(page).toHaveURL(/#\/routes$/);
  await expect(page.getByRole('heading', { name: /Network/ })).toBeVisible();
});

test('theme choice persists and the T shortcut works', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('aura-theme-mode')) localStorage.setItem('aura-theme-mode', 'paper');
    sessionStorage.setItem('aura_intro_shown', 'true');
  });
  await page.goto('/#/command', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Switch to Night' }).click();
  await expect(page.getByRole('button', { name: 'Switch to Paper' })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Switch to Paper' })).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.getByRole('button', { name: 'Switch to Night' })).toBeVisible();
});

test('two read-only tabs retain the live connection state', async ({ page, context }) => {
  await page.addInitScript(() => sessionStorage.setItem('aura_intro_shown', 'true'));
  const secondPage = await context.newPage();
  await Promise.all([
    page.goto('/#/command', { waitUntil: 'domcontentloaded' }),
    secondPage.goto('/#/command', { waitUntil: 'domcontentloaded' }),
  ]);
  await expect(page.getByRole('button', { name: 'Connection status: live' })).toBeVisible();
  await expect(secondPage.getByRole('button', { name: 'Connection status: live' })).toBeVisible();
  await secondPage.close();
});