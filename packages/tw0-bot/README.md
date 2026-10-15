Tw0 Bot

A grid of robots that fills the window, built from randomly placed rectangles. The robots stand on one light grey page, and each gets its own five-colour palette from the Colormind API (http://colormind.io/api-access/): the darkest colour becomes the main tile colour and the middle three the accents. If Colormind can't be reached, and in the site's thumbnail, the robots use two built-in charcoal palettes instead. Add `?layout=pair` for the earlier split view: a white robot on purple with orange, teal and yellow accents, beside a dark one on warm cream with indigo, purple and pink accents.

For each robot, every load generates the left half of a body from randomly sized parts (head, chest, shoulders, arms, waist, hips, legs and feet). The legs are then pushed apart and the arms out from the body until there is a clear gap, stretching the hips and shoulders to stay attached. Poisson disk sampling then scatters points across it, and each point inside the body gets a rectangle, mirrored to make the other half. Reload for new robots, or add `?outline=svg` to use the original hand-drawn outline in `public/outline.svg`. Built with two.js, bundled with Vite.

Imported from `tmp/tw0-bot`, a 2021 sketch that ran on wmr. The dependencies are updated to current versions; the generated body is new.

- `npm run dev --workspace=tw0-bot` serves it with hot reload at http://127.0.0.1:5192.
- `npm run build --workspace=tw0-bot` writes `dist/`, which the site build copies to `/sketches/tw0-bot/`.
