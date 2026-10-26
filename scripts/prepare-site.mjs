import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sketches, root, sitePublic, buildSketch } from './lib.mjs';
const items = await sketches();
await rm(resolve(sitePublic, 'sketches'), { recursive: true, force: true });
for (const item of items) {
  await buildSketch(item);
  try { await access(resolve(sitePublic, 'thumbnails', `${item.id}.png`)); }
  catch { throw new Error(`Missing thumbnail for ${item.id}: run npm run thumbnails ${item.id} and commit it`); }
}
const data = items.map(({ directory, thumbnail, ...item }) => ({ ...item, href: `/sketches/${item.id}/`, image: `/thumbnails/${item.id}.png` }));
await mkdir(resolve(root, 'apps/site/src/data'), { recursive: true });
await writeFile(resolve(root, 'apps/site/src/data/sketches.json'), JSON.stringify(data, null, 2) + '\n');
