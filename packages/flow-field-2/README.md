# Flow Field 2

Imported from `Archive/steering behaviors/flow field 2`, leaving the original folder untouched. Preserves the 600 particles steered by a 4D simplex noise flow field inside a wireframe cube.

Run `npm run dev --workspace=flow-field-2` to start it independently. The original bundled Three.js (r48) and helper scripts are retained for compatibility. The social buttons and Google Analytics snippet were removed, the unused `sdnoise1234.c` source was left behind, and the canvas now follows window resizes. Thumbnail mode seeds the noise and runs 120 fixed simulation steps; the original thumbnail image is kept as a source asset.
