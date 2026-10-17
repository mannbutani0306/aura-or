import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const routes = ['command', 'dispatch', 'fleet', 'routes', 'insights', 'kit'] as const;
const themes = ['paper', 'night'] as const;
const viewports = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
] as const;
const screenshotsDirectory = path.resolve('docs/screenshots');

mkdirSync(screenshotsDirectory, { recursive: true });

for (const route of routes) {
  for (const theme of themes) {
    for (const viewport of viewports) {
      test(`${route} ${theme} ${viewport.name}`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript((selectedTheme: string) => {
          localStorage.setItem('aura-theme-mode', selectedTheme);
          sessionStorage.setItem('aura_intro_shown', 'true');
        }, theme);
        await page.goto(`/#/${route}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#root')).not.toBeEmpty();
        if (route === 'insights') {
          await expect(page.locator('main [role="alert"], main [aria-label="Benchmark summary"]')).toBeVisible({ timeout: 30000 });
        }
        await page.evaluate(() => document.fonts.ready);

        const dimensions = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        }));
        const overflowingNodes = dimensions.documentWidth > dimensions.viewportWidth
          ? await page.evaluate(() => Array.from(document.querySelectorAll('body *')).flatMap((element) => {
            const rect = element.getBoundingClientRect();
            return rect.right > window.innerWidth + 1
              ? [{ tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }]
              : [];
          }).slice(0, 18))
          : [];
        expect(dimensions.documentWidth, `Horizontal overflow: ${JSON.stringify(overflowingNodes)}`).toBeLessThanOrEqual(dimensions.viewportWidth);

        const unnamedButtons = await page.locator('button').evaluateAll((buttons) => buttons
          .filter((button) => !button.getAttribute('aria-label') && !button.getAttribute('aria-labelledby') && !button.textContent?.trim())
          .map((button) => button.outerHTML));
        expect(unnamedButtons).toEqual([]);
        expect(pageErrors).toEqual([]);

        await page.screenshot({
          path: path.join(screenshotsDirectory, `${route}-${theme}-${viewport.name}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      });
    }
  }
}