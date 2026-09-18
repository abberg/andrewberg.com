import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { experiments, sitePublic, serve } from './lib.mjs';
export async function generateThumbnails(items) {
  await mkdir(resolve(sitePublic, 'thumbnails'), { recursive: true });
  const server = await serve(sitePublic);
  let browser;
  try {
    browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    for (const item of items) {
      const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
      await page.addInitScript(() => { let seed = 12345; Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); });
      try {
        const options = item.thumbnail ?? {};
        const url = new URL(options.path ?? '', `${server.url}/experiments/${item.id}/`);
        if (url.origin !== server.url || !url.pathname.startsWith(`/experiments/${item.id}/`)) throw new Error('Thumbnail path must stay within this experiment');
        await page.goto(url.href, { waitUntil: 'networkidle', timeout: 60000 });
        if (options.readySelector) await page.locator(options.readySelector).waitFor({ state: 'attached', timeout: 60000 });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (errors.length) throw new Error(errors.join('\n'));
        await page.screenshot({ path: resolve(sitePublic, 'thumbnails', `${item.id}.png`), animations: 'disabled' });
        console.log(`Thumbnail: ${item.id}`);
      } catch (error) { throw new Error(`Thumbnail failed for ${item.id}: ${error.message}`, { cause: error }); }
      finally { await page.close(); }
    }
  } finally { if (browser) await browser.close(); await server.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await generateThumbnails(await experiments());
