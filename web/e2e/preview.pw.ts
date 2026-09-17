import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractSansStockage, extractStockage } from '../../src/generate/extract.js';
import { renderSansStockageStandalone, renderStockageStandalone } from '../../src/generate/render.js';
import { buildComparaisonPptx } from '../../src/generate/comparaison.js';
import { writePptx, type Pptx } from '../../src/pptx/zip.js';

const fixtures: Record<string, Buffer> = {};
function buffer(zip: Pptx) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pv-browser-preview-'));
  try { const file = path.join(dir, 'output.pptx'); writePptx(zip, file); return readFileSync(file); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test.beforeAll(async () => {
  const sans = '../test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf';
  const stockage = '../test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf';
  fixtures.sans = buffer(renderSansStockageStandalone(await extractSansStockage(sans, 3)).zip);
  fixtures.stockage = buffer((await renderStockageStandalone(stockage, await extractStockage(stockage, 3))).zip);
  fixtures.comparaison = buffer((await buildComparaisonPptx([{ rangees: 3, pdfSansStockage: sans, pdfAvecStockage: stockage }])).zip);
});

async function open(page: Page, file: string) {
  await page.route('**/preview-test.html*', route => route.fulfill({ contentType: 'text/html', body: `
    <html><body><main id="root" style="max-width:1100px;margin:auto;padding:24px"></main><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    await import('/e2e/previewHarness.tsx');</script></body></html>` }));
  await page.goto(`/preview-test.html?file=${encodeURIComponent(file)}`);
}

for (const [scenario, count] of [['sans', 4], ['stockage', 5], ['comparaison', 6]] as const) {
  test(`previews all ${scenario} slides and supports navigation and zoom`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/presentation.pptx', route => route.fulfill({ body: fixtures[scenario] }));
    await open(page, '/presentation.pptx');
    await expect(page.getByRole('button', { name: /Agrandir la diapositive/ })).toHaveCount(count);
    await expect(page.getByRole('link', { name: 'Télécharger le .pptx' })).toBeVisible();
    await page.getByRole('button', { name: 'Agrandir la diapositive 2', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', `Diapositive 2 sur ${count}, agrandie`);
    await expect(page.getByRole('dialog')).toContainText('3 rangées');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', `Diapositive 3 sur ${count}, agrandie`);
    await page.locator('.lightbox-image').hover();
    await page.mouse.wheel(0, -200);
    await expect(page.locator('.lightbox-image')).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: `Agrandir la diapositive ${count}`, exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Conclusion');
    await page.getByRole('button', { name: "Fermer l'aperçu" }).click();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('14px Barlow'))).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('keeps the download available when preview retrieval fails', async ({ page }) => {
  await page.route('**/missing.pptx', route => route.fulfill({ status: 404 }));
  await open(page, '/missing.pptx');
  await expect(page.getByText(/Aperçu indisponible/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Télécharger le .pptx' })).toBeVisible();
});

test('offers the download while preview retrieval is still pending', async ({ page }) => {
  let finish!: () => void;
  const ready = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/presentation.pptx', async route => { await ready; await route.fulfill({ body: fixtures.sans }); });
  try {
    await open(page, '/presentation.pptx');
    await expect(page.getByText(/Préparation de l’aperçu/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Télécharger le .pptx' })).toBeVisible();
    finish();
    await expect(page.getByRole('button', { name: /Agrandir la diapositive/ })).toHaveCount(4);
  } finally { finish(); }
});

test('releases local images when starting over and fits a mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const urls = new Set<string>();
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); urls.add(url); return url; };
    URL.revokeObjectURL = url => { urls.delete(url); revoke(url); };
    Object.assign(window, { previewUrls: urls });
  });
  await page.route('**/presentation.pptx', route => route.fulfill({ body: fixtures.stockage }));
  await open(page, '/presentation.pptx');
  await expect(page.getByRole('button', { name: /Agrandir la diapositive/ })).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Agrandir la diapositive 2', exact: true }).click();
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390);
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const name of ['Diapositive précédente', 'Diapositive suivante']) {
      await expect.poll(async () => {
        const button = await page.getByRole('button', { name }).boundingBox();
        return Boolean(button && button.x >= 0 && button.y >= 0
          && button.x + button.width <= viewport.width && button.y + button.height <= viewport.height);
      }, { message: `${name} fits the ${viewport.width} × ${viewport.height} screen` }).toBe(true);
    }
    await page.getByRole('button', { name: 'Diapositive suivante' }).click();
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', 'Diapositive 3 sur 5, agrandie');
    await page.getByRole('button', { name: 'Diapositive précédente' }).click();
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', 'Diapositive 2 sur 5, agrandie');
  }
  await page.getByRole('button', { name: "Fermer l'aperçu" }).click();
  await page.getByRole('button', { name: 'Nouvelle présentation' }).click();
  await expect(page.getByRole('button', { name: /Agrandir/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { previewUrls: Set<string> }).previewUrls.size)).toBe(0);
});
