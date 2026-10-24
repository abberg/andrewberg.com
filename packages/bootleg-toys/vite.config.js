import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The models folder is full of ripped game assets: robots, but also effects,
// characters, backgrounds and banners. Robots are the folders named like
// A110_010_gundammk2 (a series code, a number, a name) holding a matching .fbx.
const robotFolder = /^[A-Z]\d{3}_\d{3}_(?!.*_eff)(.+)$/;

// Ships, bases, bullets and stray effect pieces share that naming, but they're
// a single rigid mesh with a handful of bones at most, where a robot is rigged
// (the Mega Man robots have few bones but are built from many meshes). Count
// both straight from the binary FBX rather than parsing it.
function count(buffer, text) {
  let n = 0;
  for (let i = buffer.indexOf(text); i !== -1; i = buffer.indexOf(text, i + 1)) n++;
  return n;
}

function isRobot(fbx) {
  return count(fbx, 'LimbNode') >= 6 || count(fbx, 'GeometryS\x04\x00\x00\x00Mesh') >= 10;
}

// Hand-picked leftovers that pass those checks but aren't robots worth
// keeping: mobile armours, pilots, bikes, monsters and the like.
const excluded = new Set([
  'alphaazieru', 'nightingale', 'bug', 'masterasia', 'devilgundam', 'gaga_bo',
  'military_bike_side', 'zmaster', 'siegfried', 'alexander_a_ins', 'jimba_r', 'ulvorful',
  'arc2j1', 'wygar', 'ravana', 'dragon_schooner', 'strike_siegwurm_b', 'spacemonsterf',
  'kantam_robo', 'ryuho_last', 'samekh', 'samekh_s', 'kisaragi_om',
]);

// Kitbashing needs the standard humanoid rig: a head, a spine, two arms and
// two legs. Jets, dragons and tanks don't have one. Some that do still have
// nothing to recombine: Noir Getter 2 is a hooded cloak all the way down,
// and Hekiryugo is a dragon at heart.
const notForKitbash = new Set(['noir_getter2', 'hekiryugo', 'heybot']);
const humanoidBones = ['mot_head', 'mot_spine', 'mot_arm_l', 'mot_arm_r', 'mot_upleg_l', 'mot_upleg_r'];
const isHumanoid = (fbx) => humanoidBones.every((bone) => fbx.includes(`${bone}\x00\x01Model`));

function robots() {
  const dir = new URL('./public/models/', import.meta.url);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => robotFolder.test(id) && !excluded.has(id.match(robotFolder)[1]))
    .filter((id) => existsSync(new URL(`${id}/${id}.fbx`, dir)))
    .sort()
    .map((id) => ({ id, fbx: readFileSync(new URL(`${id}/${id}.fbx`, dir)) }))
    .filter(({ fbx }) => isRobot(fbx))
    .map(({ id, fbx }) => {
      const name = id.match(robotFolder)[1];
      return { id, name, humanoid: isHumanoid(fbx) && !notForKitbash.has(name) };
    });
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
