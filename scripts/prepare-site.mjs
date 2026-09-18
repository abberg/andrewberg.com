import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { experiments, root, sitePublic, run } from './lib.mjs';
import { generateThumbnails } from './thumbnails.mjs';
const items = await experiments();
await rm(resolve(sitePublic, 'experiments'), { recursive: true, force: true });
await rm(resolve(sitePublic, 'thumbnails'), { recursive: true, force: true });
for (const item of items) {
  await run('npm', ['run', 'build'], item.directory);
  await cp(resolve(item.directory, 'dist'), resolve(sitePublic, 'experiments', item.id), { recursive: true });
}
await generateThumbnails(items);
const data = items.map(({ directory, thumbnail, ...item }) => ({ ...item, href: `/experiments/${item.id}/`, image: `/thumbnails/${item.id}.png` }));
await mkdir(resolve(root, 'apps/site/src/data'), { recursive: true });
await writeFile(resolve(root, 'apps/site/src/data/experiments.json'), JSON.stringify(data, null, 2) + '\n');
