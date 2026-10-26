Bootleg Toys

A workbench for playing with 3D models in plain three.js, bundled with Vite. It opens on a belt of kitbashed robots. The single-robot viewer frames a model on a turntable, lit by three's neutral `RoomEnvironment`: drag to orbit, scroll to zoom, and drop a `.glb` (or a self-contained `.gltf`) on the page to swap it in.

- `npm run dev --workspace=bootleg-toys` serves it with hot reload at http://127.0.0.1:5196.
- `npm run build --workspace=bootleg-toys` writes `dist/`, which the site build copies to `/sketches/bootleg-toys/`.

Code is in `src/`. The robots' FBX files go in `public/models/`, which is kept locally and not committed; the single-robot viewer (`#viewer`) loads them from there. The kitbash belt loads small GLBs of their bodies and skeletons from `public/kitbash/`, which is committed, so the published sketch has them. `node packages/bootleg-toys/scripts/convert-kitbash.mjs` makes them from the FBX files; which robots are kitbashed, and which are left out as duplicates of others, is in `robots.js`.
