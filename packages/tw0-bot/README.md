Tw0 Bot

A mirrored robot built from randomly placed rectangles. Poisson disk sampling scatters points across the hand-drawn half outline in `public/outline.svg`, and each point inside it gets a rectangle, which is then mirrored to make the other half. Reload for a new robot. Built with two.js, bundled with Vite.

Imported from `tmp/tw0-bot`, a 2021 sketch that ran on wmr. The dependencies are updated to current versions and the code is otherwise as it was.

- `npm run dev --workspace=tw0-bot` serves it with hot reload at http://127.0.0.1:5192.
- `npm run build --workspace=tw0-bot` writes `dist/`, which the site build copies to `/sketches/tw0-bot/`.
