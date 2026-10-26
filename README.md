# andrewberg.com

A static Astro gallery with independent browser sketches, managed with npm workspaces.

## Start

Use Node 24 (see `.node-version`). From the repository root:

```sh
npm install
npm run dev
```

The site runs at http://127.0.0.1:4321. The root dev command builds the sketches before starting Astro. To edit a sketch with automatic JavaScript rebuilds, run `npm run dev --workspace=model_001` (or another package). Refresh its browser page after a rebuild; restart its dev command after editing its HTML.

## Build and preview

```sh
npm run build
npm run preview
```

The build discovers packages containing `sketch.json`, runs their build scripts, copies their `dist/` folders into Astro's generated public assets, checks that every sketch has a thumbnail, writes the gallery data, then builds Astro. Output is `apps/site/dist/`. All sketch URLs and images are local to that static deployment. No server runtime is required.

`npm run prepare:site` rebuilds all sketches and gallery data. Run it after editing packages if Astro is already running. Generated outputs are ignored by Git.

Thumbnails are captured locally in Chromium and committed in `apps/site/public/thumbnails/`, so Netlify builds never download a browser. Run `npm run browsers:install` once. A Husky pre-commit hook then recaptures the thumbnail of every sketch with staged changes under `packages/<sketch>/` and adds it to the commit, unless that thumbnail is already staged. It builds from the working tree, so with partially staged files the thumbnail may show unstaged edits. Set `SKIP_THUMBNAILS=1` to skip it. `npm run thumbnails` rebuilds and recaptures every sketch, and `npm run thumbnails hatch wander` only the named ones. A sketch without a thumbnail fails the build.

To save build minutes, `scripts/netlify-ignore.sh` skips deploy previews for Dependabot PRs and production builds of commits that change nothing under `apps`, `packages`, `scripts`, the npm manifests, `netlify.toml` or `.node-version`.

## Structure

- `apps/site`: the Astro site, with two pages: `index.astro` (design systems timeline and featured sketches) and `sketches.astro` (every browser sketch plus the recorded C++ sketches).
  - `src/layouts/Base.astro`: page shell, header, footer, theme toggle, and global styles.
  - `src/components`: `SketchTiles.astro` for the thumbnail grids, and `heroes/` for the illustrated design system cards on the home page.
  - `src/data`: `work.json` (timeline entries), `videos.json` (Vimeo clips), and the generated `sketches.json`.
  - `public/thumbnails`: committed sketch thumbnails. `public/sketches` is generated.
- `packages/*`: one workspace per browser sketch, each with a `sketch.json` whose `order` sets its number. Most copy plain `src/` files with a small `build.mjs`. `voronoi-particles` bundles with esbuild, `model_001`–`model_004` use `scripts/build-sketch.mjs`, and `bootleg-toys`, `infinite-circus`, `shape-grammar`, and `tw0-bot` use Vite. Each package has its own Three.js or other library versions, from three 0.71 in the A Thousand More sketches to 0.186 in the newest, and can be modernized independently.
- `packages/model_base`: shared rendering and interaction code for the arch models; excluded from the gallery because it has no sketch metadata.
- `scripts`: sketch discovery, building, and the static server for dev and capture (`lib.mjs`), the esbuild sketch build (`build-sketch.mjs`), site preparation (`prepare-site.mjs`), thumbnail capture and its pre-commit hook (`thumbnails.mjs`, `thumbnail-hook.mjs`), and the Netlify ignore check (`netlify-ignore.sh`).
- `.husky/pre-commit`: runs the thumbnail hook.
- `netlify.toml`: build settings and the `/experiments/*` → `/sketches/*` redirect.

## Add a sketch

Create `packages/my-sketch/package.json` with a unique name and a `build` script that emits a self-contained `dist/index.html` and assets. Use relative asset URLs or configure the app for `/sketches/my-sketch/`. Frameworks and build tools can differ between packages. Run `npm install` after adding a workspace.

Add `sketch.json`:

```json
{
  "title": "My sketch",
  "description": "A short description.",
  "category": "Interactive study",
  "order": 6,
  "thumbnail": {
    "path": "?thumbnail=1",
    "readySelector": "html[data-thumbnail-ready=\"true\"]"
  }
}
```

Thumbnail settings are optional. Paths are relative to the sketch's deployed directory. By default capture waits for network idle, fonts, and two animation frames at 960 × 720. For asynchronous or animated work, expose a readiness selector and a stable capture state. The restored models use `?thumbnail=1` to freeze the camera and signal readiness after assets have loaded and the scene renders. The capture browser also seeds randomness. Broken pages, missing assets, and readiness timeouts fail the build instead of silently leaving stale thumbnails.

Each app must work on a direct visit to its deployed path. Client routers should use a hash router or emit static routes appropriate to the deployment.
