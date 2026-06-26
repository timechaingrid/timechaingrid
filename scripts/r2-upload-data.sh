#!/usr/bin/env bash
# scripts/r2-upload-data.sh — upload the tiered parquet bundle to our Cloudflare
# R2 bucket so prod can range-read the >25MB wallets.parquet cross-origin
# (Cloudflare Pages can't host files > 25MB).
#
# The Civ-6 empire map (src/data/walletSubstrate.ts) fetches manifest.json +
# wallets.parquet from here; the rest of the version dir rides along so the
# sister Graph force-view can reuse the identical R2 bundle. We REUSE the Graph
# project's bucket (data.timechaingraph.com) — same one that hosts the DuckDB
# wasm — and its CORS already allows the timechaingrid.com origin + range reads.
#
# Prereqs (operator, one-time — needs Cloudflare auth):
#   1. npx wrangler login
#   2. The bucket already exists + is public at data.timechaingraph.com
#      (created for the DuckDB wasm — see scripts/r2-upload-wasm.sh in the Graph
#      repo / docs/cloudflare-deploy.md).
# Then run this. Idempotent — safe to re-run after a bundle rebuild.
#
#   BUCKET=my-bucket VERSION=v0.2.0 ./scripts/r2-upload-data.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${BUCKET:-timechaingraph-data}"
VERSION="${VERSION:-v0.2.0}"
DATA_DIR="public/data/${VERSION}"
CORS_RULES="r2-cors.json"

[ -d "$DATA_DIR" ] || { echo "✗ $DATA_DIR not found — build the bundle first (build_bundle.py)." >&2; exit 1; }

echo "▸ R2 bucket: $BUCKET"
echo "▸ uploading ${DATA_DIR}/ → ${BUCKET}/data/${VERSION}/ …"
shopt -s nullglob
uploaded=0
for f in "$DATA_DIR"/*; do
  name="$(basename "$f")"
  case "$name" in
    *.json)    ct="application/json" ;;
    *)         ct="application/octet-stream" ;;  # parquet: binary, DuckDB range-reads it
  esac
  echo "  → $name ($(du -h "$f" | cut -f1), $ct)"
  npx wrangler r2 object put "${BUCKET}/data/${VERSION}/${name}" \
    --file "$f" \
    --content-type "$ct" \
    --remote
  uploaded=$((uploaded + 1))
done
[ "$uploaded" -gt 0 ] || { echo "✗ no files in $DATA_DIR — nothing uploaded." >&2; exit 1; }

# CORS is per-bucket (not per-prefix) and was already applied by the wasm upload;
# re-apply only if this repo carries the rules file (keeps the script standalone).
if [ -f "$CORS_RULES" ]; then
  echo "▸ ensuring CORS (${CORS_RULES}) — range reads (GET/HEAD) from our origins"
  npx wrangler r2 bucket cors set "$BUCKET" --file "./${CORS_RULES}"
else
  echo "  (no $CORS_RULES here — CORS already set on the shared bucket via the wasm upload)"
fi

echo "✓ data bundle ${VERSION} uploaded to '${BUCKET}/data/${VERSION}/'."
cat <<EOF

Next:
  1. Confirm it's served (both must return 200):
       curl -sI https://data.timechaingraph.com/data/${VERSION}/manifest.json
       curl -sI https://data.timechaingraph.com/data/${VERSION}/wallets.parquet
  2. Deploy with the empire map pointed at it (already in .env.production):
       NEXT_PUBLIC_WALLET_DATA_BASE_URL=https://data.timechaingraph.com/data/${VERSION}
       npm run deploy
  3. Verify on /grid (DevTools → Network): wallets.parquet from the R2 domain,
     manifest.json + *.worker.js from the page origin; privacy-audit green.
EOF
