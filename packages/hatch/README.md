# Freudenberg Hatch Shader

Imported from `Archive/npr rendering/hatch`, leaving the original folder untouched. The original bundled Three.js (r49), Evangelion Unit-01 model, shaders, and helper scripts are kept as they were.

Run `npm run dev --workspace=hatch` to start it independently. Drag to orbit the camera and scroll to zoom. Input now uses pointer and wheel events instead of the old mouse and mousewheel events, so it also works with touch. The Google Analytics snippet was removed.

`js/thumbnail.js` drives thumbnail mode: it waits for the model to load, seeds `Math.random`, runs 240 frames on a virtual clock, then freezes the scene for capture.
