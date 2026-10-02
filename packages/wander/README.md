# Wander

Imported from `Archive/steering behaviors/wander`, leaving the original folder untouched. The original bundled Three.js and helper scripts are kept as they were.

Run `npm run dev --workspace=wander` to start it independently. The social buttons, Open Graph image, and Google Analytics snippet were removed, and the canvas now follows window resizes. `js/thumbnail.js` drives thumbnail mode: it seeds `Math.random`, runs 240 frames on a virtual clock, then freezes the scene for capture. The original thumbnail image is kept as a source asset.
