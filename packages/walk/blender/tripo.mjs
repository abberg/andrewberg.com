// Sends the reference photos in tripo/ (front, back, left, right .png) to
// Tripo's multiview-to-model API and saves the mesh it makes to tripo/model.glb,
// as a reference to model over in Blender. The key is read from the
// TRIPO_API_KEY environment variable, or from .claude/tripo-key at the repo
// root (not in git).
//
//   node packages/walk/blender/tripo.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const keyFile = join(here, '../../../.claude/tripo-key');
const key = process.env.TRIPO_API_KEY ?? (existsSync(keyFile) ? (await readFile(keyFile, 'utf8')).trim() : '');
if (!key) throw new Error('No Tripo key: set TRIPO_API_KEY or write it to .claude/tripo-key');

const api = 'https://openapi.tripo3d.ai/v3';
const headers = { Authorization: `Bearer ${key}` };

async function call(path, options = {}) {
  const response = await fetch(api + path, { ...options, headers: { ...headers, ...options.headers } });
  const body = await response.json();
  if (!response.ok || body.code !== 0) throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`);
  return body.data;
}

const inputs = [];
for (const view of ['front', 'left', 'back', 'right']) {
  const file = join(here, 'tripo', `${view}.png`);
  if (!existsSync(file)) continue;
  const form = new FormData();
  form.append('file', new Blob([await readFile(file)], { type: 'image/png' }), `${view}.png`);
  const { file_token } = await call('/files', { method: 'POST', body: form });
  inputs.push({ [view]: file_token });
  console.log('uploaded', view);
}

const { task_id } = await call('/generation/multiview-to-model', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  // Geometry only: the mesh is a shape reference, and the photos' paint differs.
  body: JSON.stringify({ inputs, model: process.env.TRIPO_MODEL ?? 'P2-20260801', texture: false, pbr: false }),
});
console.log('task', task_id);

for (;;) {
  await new Promise(resolve => setTimeout(resolve, 5000));
  const task = await call(`/tasks/${task_id}`);
  console.log(task.status, task.progress ?? '');
  if (task.status === 'success') {
    const model = await fetch(task.output.model_url);
    await writeFile(join(here, 'tripo', 'model.glb'), Buffer.from(await model.arrayBuffer()));
    console.log('saved tripo/model.glb, credits used:', task.credits_consumed);
    break;
  }
  if (!['queued', 'running'].includes(task.status)) throw new Error(`task ${task.status}: ${task.error_message ?? ''}`);
}
