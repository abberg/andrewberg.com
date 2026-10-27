// Extracts the heads in scripts/picks.json into public/heads, which is
// committed, so the published sketch has them, and writes their names, sizes
// and colliders to src/heads.json:
//
//   node packages/bumping-heads/scripts/extract-heads.mjs ".../public/player_units_glb"
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractHead } from './head.mjs';

const source = process.argv[2];
if (!source) throw new Error('Pass the path of the player_units_glb folder');
const out = fileURLToPath(new URL('../public/heads/', import.meta.url));
mkdirSync(out, { recursive: true });

// Units this tall or more (the Aquarion series, Koenig Monster, against about
// 20 for most) have heads big enough that the sketch only spawns one at a time.
const large = 40;
// Heads smaller than this across (the Code Geass and Full Metal Panic units,
// about a third of a Gundam's) are grown to it, the size of the Savage's, so
// they don't get lost in the cloud.
const smallest = 1.5;

const picks = JSON.parse(readFileSync(new URL('picks.json', import.meta.url), 'utf8'));
const heads = [];
for (const { code, name, file } of picks) {
  const head = await extractHead(join(source, file));
  await head.write(join(out, `${code}.glb`));
  const { skull } = head.colliders;
  const across = Math.max(...[0, 1, 2].map((k) => {
    const xs = skull.filter((_, i) => i % 3 === k);
    return Math.max(...xs) - Math.min(...xs);
  }));
  const grow = Math.max(1, smallest / across);
  heads.push({ code, name, large: head.height >= large, grow: Math.round(grow * 100) / 100, colliders: head.colliders });
}
// Heads no longer picked go.
for (const file of readdirSync(out)) if (!picks.some(({ code }) => file === `${code}.glb`)) rmSync(join(out, file));
writeFileSync(new URL('../src/heads.json', import.meta.url), JSON.stringify(heads) + '\n');
console.log(`${heads.length} heads in ${out}`);
