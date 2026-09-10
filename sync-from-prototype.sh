#!/usr/bin/env bash
# Pull the latest app source from the prototype repo into this deploy repo.
#
# Copies ONLY the app source. It never touches the deploy-specific files:
# wrangler.jsonc, package.json, DEPLOY.md, this script, .dev.vars, .git.
#
# After running: `git diff` to see what changed, `npm run check && npx vitest run`,
# then `npm run deploy`.
set -euo pipefail

SRC="${1:-/home/tudorb/Documents/layoo/prototypes/kitchen-questions-form/webapp}"
DST="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$SRC/src" ]; then
  echo "No app source at $SRC — pass the prototype webapp path as the first argument." >&2
  exit 1
fi

echo "Syncing  $SRC  ->  $DST"
rsync -a --delete "$SRC/src/"    "$DST/src/"
rsync -a --delete "$SRC/static/" "$DST/static/"
cp "$SRC/tsconfig.json" "$SRC/vitest.config.ts" "$DST/"

# vite.config.ts differs by one line (the adapter), so re-derive it instead of copying.
sed "s|@sveltejs/adapter-node|@sveltejs/adapter-cloudflare|" "$SRC/vite.config.ts" > "$DST/vite.config.ts"

# The deploy copy carries a demo fallback the prototype does not have; re-apply it.
if ! grep -q "isUnconfigured" "$DST/src/lib/hubspot/client.ts"; then
  echo
  echo "!! src/lib/hubspot/client.ts came over without the demo fallback."
  echo "!! Re-apply it (see DEPLOY.md > 'Demo mode') or the test deploy will error on submit."
fi

echo "Done. Now:  git diff  &&  npm run check && npx vitest run  &&  npm run deploy"
