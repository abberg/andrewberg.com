import { readdirSync, existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import { fbxRobots, robotFolder } from './robots.js';

// The robots: those in public/models (local only, for the viewer) and the
// kitbash set converted from them into public/kitbash (committed, so the
// published belt has them; see scripts/convert-kitbash.mjs).
function robots() {
  const kitbash = new URL('./public/kitbash/', import.meta.url);
  const converted = existsSync(kitbash) ? readdirSync(kitbash).filter((file) => file.endsWith('.glb')).map((file) => file.slice(0, -4)) : [];
  const list = new Map(fbxRobots().map(({ id, name }) => [id, { id, name, fbx: true, kitbash: false }]));
  for (const id of converted) list.set(id, { id, name: id.match(robotFolder)[1], fbx: list.has(id), kitbash: true });
  return [...list.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// import robots from 'virtual:robots' gives the list, read when the server starts.
function robotList() {
  const resolved = '\0virtual:robots';
  return {
    name: 'robot-list',
    resolveId: (id) => (id === 'virtual:robots' ? resolved : null),
    load: (id) => (id === resolved ? `export default ${JSON.stringify(robots())};` : null),
  };
}

// Some robots (Strike Freedom, Wing Zero EW, ...) attach their meshes to nodes
// that are also bones. three's FBXLoader then makes those nodes bare Bones and
// never builds the mesh, so binding the skin throws "model.bind is not a
// function". Patch it to build the mesh too, as a child of the bone, and bind
// that. Each replacement must match, so a three upgrade that moves this code
// fails loudly rather than quietly dropping the patch.
const fbxPatches = [
  [
    'let model = this.buildSkeleton( relationships, skeletons, id, node.attrName );',
    `let model = this.buildSkeleton( relationships, skeletons, id, node.attrName );
			if ( model && node.attrType === 'Mesh' ) {
				const mesh = this.createMesh( relationships, geometryMap, materialMap );
				mesh.name = model.name;
				model.add( mesh );
				model.userData.fbxMesh = mesh;
			}`,
  ],
  [
    'const model = modelMap.get( geoConnParent.ID );',
    `let model = modelMap.get( geoConnParent.ID );
							if ( model.isBone ) model = model.userData.fbxMesh;
							if ( ! model?.isSkinnedMesh ) return;`,
  ],
];

function patchFbxLoader() {
  return {
    name: 'patch-fbx-loader',
    transform(code, id) {
      if (!id.split('?')[0].endsWith('/loaders/FBXLoader.js')) return null;
      for (const [from, to] of fbxPatches) {
        if (!code.includes(from)) throw new Error(`FBXLoader patch didn't match: ${from}`);
        code = code.replace(from, to);
      }
      return code;
    },
  };
}

export default defineConfig({
  plugins: [robotList(), patchFbxLoader()],
  // Pre-bundled dependencies skip plugin transforms, so leave FBXLoader out.
  optimizeDeps: { exclude: ['three/addons/loaders/FBXLoader.js'] },
  // Relative URLs, so the build works wherever the site serves it (/sketches/bootleg-toys/).
  base: './',
  // A fixed address for the dev server, rather than a new port on every restart.
  server: { host: '127.0.0.1', port: 5196, strictPort: true },
  preview: { host: '127.0.0.1', port: 5197, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
