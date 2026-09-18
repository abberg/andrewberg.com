import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const sitePublic = resolve(root, 'apps/site/public');
export async function experiments() {
  const entries = await readdir(resolve(root, 'packages'), { withFileTypes: true });
  const result = [];
  for (const entry of entries.filter(e => e.isDirectory())) {
    const directory = resolve(root, 'packages', entry.name);
    let raw;
    try { raw = await readFile(resolve(directory, 'experiment.json'), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const metadata = JSON.parse(raw);
    if (!/^[a-z0-9_-]+$/.test(entry.name) || !metadata.title || !metadata.description) throw new Error(`Invalid experiment metadata: ${entry.name}`);
    result.push({ ...metadata, id: entry.name, directory });
  }
  return result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}
export function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}
export async function serve(directory) {
  const base = resolve(directory);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = resolve(base, '.' + pathname);
      if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
