// Pre-commit: recaptures thumbnails for sketches with staged changes and stages them.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sketches, root, sitePublic } from './lib.mjs';
import { captureSketches } from './thumbnails.mjs';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
if (process.env.SKIP_THUMBNAILS) process.exit(0);
const staged = git('diff', '--cached', '--name-only', '--no-renames', '-z').split('\0').filter(Boolean);
const changed = new Set(staged.map(file => file.match(/^packages\/([^/]+)\/(.+)$/)).filter(match => match && !/\.md$/i.test(match[2])).map(match => match[1]));
const thumbnail = id => `apps/site/public/thumbnails/${id}.png`;
const ids = (await sketches()).map(item => item.id).filter(id => changed.has(id) && !staged.includes(thumbnail(id)));
// A sketch whose sketch.json is gone no longer needs a thumbnail.
const removed = [...changed].filter(id => !existsSync(resolve(root, 'packages', id, 'sketch.json')) && git('ls-files', thumbnail(id)).trim());
for (const id of removed) {
  await rm(resolve(sitePublic, 'thumbnails', `${id}.png`), { force: true });
  git('rm', '--cached', '--quiet', thumbnail(id));
  console.log(`Removed thumbnail: ${id}`);
}
if (!ids.length) process.exit(0);
console.log(`Recapturing thumbnails: ${ids.join(', ')} (SKIP_THUMBNAILS=1 to skip)`);
await captureSketches(ids);
git('add', '--', ...ids.map(thumbnail));
