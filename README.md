# andrewberg.com

A static Astro gallery with independent browser sketches, managed with npm workspaces.

## Start

Use Node 24 (see `.node-version`). From the repository root:

```sh
npm install
npm run browsers:install
npm run dev
```

The site runs at http://127.0.0.1:4321. The root dev command builds the sketches and captures thumbnails before starting Astro. To edit a sketch with automatic JavaScript rebuilds, run `npm run dev --workspace=model_001` (or another package). Refresh its browser page after a rebuild; restart its dev command after editing its HTML.

## Build and preview

```sh
npm run build
npm run preview
```

The build discovers packages containing `sketch.json`, runs their build scripts, copies their `dist/` folders into Astro's generated public assets, captures thumbnails in Chromium, writes the gallery data, then builds Astro. Output is `apps/site/dist/`. All sketch URLs and images are local to that static deployment. No server runtime is required.

`npm run thumbnails` recaptures the already prepared sketches. `npm run prepare:site` rebuilds all sketches, thumbnails, and gallery data. Run it after editing packages if Astro is already running. Generated outputs are ignored by Git.

Netlify downloads Chromium with `npm run browsers:install` and runs the complete build. This does not request root access or install OS packages: Netlify must provide the required system libraries. Use `--with-deps` only on Linux CI systems where installing system packages is permitted. Browser downloads require network access on first setup.

## Structure

- `apps/site`: Astro homepage and gallery.
- `packages/model_001` through `model_004`: standalone Three.js sketches restored from the archive.
- `packages/model_base`: shared rendering and interaction code; excluded from the gallery because it has no sketch metadata.
- `scripts`: package builds, discovery, static serving, and thumbnail capture.

The old sketches retain Three.js 0.128 while their build tooling has been replaced. They can be modernized independently.

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
