Tw0 Bot

A mirrored robot built from randomly placed rectangles. Each load generates the left half of a body from randomly sized parts (head, chest, shoulders, arms, waist, hips, legs and feet). Poisson disk sampling then scatters points across it, and each point inside the body gets a rectangle, mirrored to make the other half. Reload for a new robot, or add `?outline=svg` to use the original hand-drawn outline in `public/outline.svg`. Built with two.js, bundled with Vite.

Imported from `tmp/tw0-bot`, a 2021 sketch that ran on wmr. The dependencies are updated to current versions; the generated body is new.

- `npm run dev --workspace=tw0-bot` serves it with hot reload at http://127.0.0.1:5192.
- `npm run build --workspace=tw0-bot` writes `dist/`, which the site build copies to `/sketches/tw0-bot/`.
