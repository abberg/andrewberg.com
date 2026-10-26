#!/bin/sh
# Netlify's ignore command: exit 0 skips the build, any other status builds.
# Dependabot PRs are built when merged, so they get no deploy preview.
case "$CONTEXT:$HEAD" in deploy-preview:dependabot/*) exit 0 ;; esac
# Production skips commits that change nothing the site is built from.
if [ "$CONTEXT" = production ] && [ -n "$CACHED_COMMIT_REF" ] && [ "$CACHED_COMMIT_REF" != "$COMMIT_REF" ]; then
  git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- apps packages scripts package.json package-lock.json netlify.toml .node-version && exit 0
fi
exit 1
