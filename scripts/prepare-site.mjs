import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sketches, root, sitePublic, run } from './lib.mjs';
import { generateThumbnails } from './thumbnails.mjs';
const items = await sketches();
await rm(resolve(sitePublic, 'sketches'), { recursive: true, force: true });
await rm(resolve(sitePublic, 'thumbnails'), { recursive: true, force: true });
for (const item of items) {
  await run('npm', ['run', 'build'], item.directory);
  await cp(resolve(item.directory, 'dist'), resolve(sitePublic, 'sketches', item.id), { recursive: true });
}
await generateThumbnails(items);
const data = items.map(({ directory, thumbnail, ...item }) => ({ ...item, href: `/sketches/${item.id}/`, image: `/thumbnails/${item.id}.png` }));
await mkdir(resolve(root, 'apps/site/src/data'), { recursive: true });
await writeFile(resolve(root, 'apps/site/src/data/sketches.json'), JSON.stringify(data, null, 2) + '\n');
