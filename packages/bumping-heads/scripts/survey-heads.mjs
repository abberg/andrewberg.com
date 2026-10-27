// Takes the head off every unit in the ACE R model browser's player units,
// skipping ones that look the same as one already seen (the variants), and
// writes them to survey/ (not committed) for survey.html to show as a contact
// sheet, to pick heads from for scripts/picks.json:
//
//   node packages/bumping-heads/scripts/survey-heads.mjs ".../public/player_units_glb"
//   npm run dev --workspace=bumping-heads, then open /survey.html
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractHead } from './head.mjs';

const source = process.argv[2];
if (!source) throw new Error('Pass the path of the player_units_glb folder');
const out = fileURLToPath(new URL('../survey/', import.meta.url));
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

// Units whose "head" isn't a helmet: faces, mascots, a cockpit.
const exclude = new Set(['c02_005_00', 'c19_006_00', 'c19_007_00', 'c25_010_00', 'c26_001_00', 'c26_180_00']);

// Silhouettes differing in fewer than this many cells are the same head.
const same = 12;
const distance = (a, b) => a.reduce((sum, bit, i) => sum + (bit !== b[i]), 0);

const catalog = JSON.parse(readFileSync(join(source, 'catalog.json'), 'utf8'));
const heads = [];
for (const unit of catalog.units) {
  if (/^(Do Not Use|Test)\//.test(unit.folder) || exclude.has(unit.code)) continue;
  const model = unit.models.find((m) => m.model === unit.code) ?? unit.models.find((m) => m.role === 'unit');
  if (!model) continue;
  let head;
  try {
    head = await extractHead(join(source, model.file));
  } catch (error) {
    console.warn(`${unit.code} ${unit.name_en}: ${error.message}`);
    continue;
  }
  if (heads.some((other) => distance(head.silhouette, other.silhouette) < same)) continue;
  await head.write(join(out, `${unit.code}.glb`));
  // The skull's size, from its hull.
  const hull = head.colliders.skull;
  const size = [0, 1, 2].map((k) => hull.filter((_, i) => i % 3 === k)).map((xs) => Math.round((Math.max(...xs) - Math.min(...xs)) * 10) / 10);
  heads.push({ code: unit.code, name: unit.name_en, series: unit.series_en, file: model.file, size, silhouette: head.silhouette });
}
writeFileSync(join(out, 'list.json'), JSON.stringify(heads.map(({ silhouette, ...head }) => head), null, 2));
console.log(`${heads.length} distinct heads in ${out}`);
