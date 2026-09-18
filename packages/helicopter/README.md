# Helicopter

Copied from `_archive/src`, including the model, texture, shaders, loaders, and original scene styling. The name overlay has been removed.

```sh
npm run dev --workspace=helicopter
npm run build --workspace=helicopter
```

The dev command prints its local URL. Source edits are copied automatically; refresh the browser to see them.

The site build publishes this package at `/experiments/helicopter/` and generates its thumbnail. The homepage still shows the four architectural models.

Three.js is served locally using the archive's r106 version for compatibility. This legacy dependency has a known npm advisory and has not been modernized. The only scene changes are a declared composer variable, loading-error reporting, and a fixed animation time/readiness signal for thumbnail capture.
