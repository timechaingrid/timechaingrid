#!/usr/bin/env bash
# scripts/deploy.sh — production build + Cloudflare Pages deploy for timechaingrid.
#
# Cloudflare Pages rejects any file > 25MB. The only assets over that are the
# DuckDB .wasm modules (mvp 39MB, eh 34MB) — served from our R2 bucket and
# STRIPPED from the upload here. The small DuckDB worker .js files MUST stay in
# the upload — `new Worker(url)` forbids cross-origin scripts, so the worker
# loads same-origin while only the .wasm comes from R2.
#
# We REUSE the sister Graph project's R2 bucket (data.timechaingraph.com): it
# already hosts the identical pinned DuckDB-Wasm version, and its CORS already
# allows the timechaingrid.com origin. So there is NO separate wasm upload for
# Grid — just point the runtime at that bucket:
#   export NEXT_PUBLIC_DUCKDB_WASM_BASE="https://data.timechaingraph.com"
#
# The parquet data bundle (public/data/, ~16MB — block-miners + timestamps) is
# every file < 25MB, so it SHIPS SAME-ORIGIN in the upload; no R2 needed for it.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ vendor DuckDB-Wasm assets (same-origin worker + wasm into public/)"
node scripts/copy-duckdb-assets.mjs

echo "▸ generate OG share image (public/og.png)"
node scripts/gen-og-image.mjs

echo "▸ clean build"
rm -rf .next out
npx next build

echo "▸ strip the >25MB DuckDB wasm (served from R2; KEEP the worker .js — same-origin)"
rm -f  out/duckdb/*.wasm   # 39/34MB → R2 (the Graph bucket)
rm -rf out/blocks          # legacy per-block snapshots, if present
# NOTE: out/data (the ~16MB parquet bundle) is intentionally KEPT — every file
# is under the 25MB limit, so it ships same-origin.

echo "▸ guard: any file still over 25MB will be rejected by Pages —"
OVERSIZE=$(find out -type f -size +25M -print)
if [ -n "$OVERSIZE" ]; then
  echo "✗ oversized files remain (add them to the strip above):" >&2
  printf '%s\n' "$OVERSIZE" | sed 's/^/    /' >&2
  exit 1
fi
echo "  none — good."

echo "▸ privacy audit (no third-party domains in the build)"
npm run privacy-audit

echo "▸ deploy to Cloudflare Pages"
npx wrangler pages deploy out --project-name=timechaingrid --branch=main

echo "✓ deployed."
echo "  DUCKDB_WASM_BASE = ${NEXT_PUBLIC_DUCKDB_WASM_BASE:-UNSET → /grid is BROKEN in prod (wasm stripped); set it to https://data.timechaingraph.com}"
