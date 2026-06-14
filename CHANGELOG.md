# Changelog

All notable changes to **Timechain Grid** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-09

### Added

- Initial public release of Timechain Grid — a privacy-first, no-tracking
  2D viewer of the Bitcoin chain. Every coin ever mined occupies a tile on
  a deterministic spiral expanding from Satoshi at the origin.
- Static export build pipeline targeting Cloudflare Pages
  (`output: 'export'`, `trailingSlash: true`).
- Full document site under `(site)` route group: `/`, `/about`, `/api`,
  `/docs`, `/donate`, `/login`, `/pricing`, `/privacy`, `/status`.
- Kiosk-mode viewer at `/grid` rendering a PixiJS canvas with deterministic
  spiral coin placement, hover-driven empire-territory hull, scrubbable
  block playback, and a top-center BlockNarrative HUD that shows the
  current block, approximate chain date, minter role color, subsidy, and
  cumulative supply.
- Per-block snapshot tree under `public/blocks/shard-NNN/BBBBBBB.json`
  driving the BlockNarrative HUD; `block-state/v2` schema carries
  `minterRole` so the HUD can role-color the entire scrubber range.
- Slim wallet bundle at `public/wallets-bundle.json` with `wallet-bundle/v1`
  schema; consumed by `BitcoinChainAdapter.getNodes()` for v0.2 grid-side
  data path.
- Live-status sidecar at `public/status.json` carrying chain tip, last
  block time, pipeline health, and snapshot freshness — auto-synced from
  the operator-run substrate walker on every `npm run snapshot:generate`.
- `chain-tools/lib/chain.mjs`: shared Bitcoin issuance constants and math
  (subsidy schedule, halving heights, cumulative supply, sat-precise
  bigint subsidy). 44 checkpoint tests pin the math against well-known
  Bitcoin reference points.
- Per-block snapshot generator (operator-side): deterministic
  generator emitting structured markdown + Prolog facts + spiral
  index plus the runtime artifacts above. Reads optional
  operator-run real-substrate when `GRID_REAL_SUBSTRATE_DIR` env
  var is set; otherwise falls back to a synthetic 3,000-block
  fixture.
- `scripts/privacy-audit.sh`: CI gate that fails the build if any
  forbidden third-party domain is referenced in `out/`.
- GitHub Actions workflow running lint → typecheck → test → build →
  privacy-audit on every push and pull request.
- `next.config.ts` configured for Cloudflare Pages static export.
- `.github/FUNDING.yml`: placeholder for future donation rails.
- 245 unit tests across `src/lib/`, `src/store/`, `src/types/`,
  `src/components/`, and `src/data/`.

### Privacy

- The viewer makes **zero third-party network calls** at runtime.
  System fonts only (no Google Fonts). No analytics. No CDN-hosted
  third-party scripts. Verifiable in the browser's DevTools Network
  tab during a full session.
- The `privacy-audit` step runs against every build and fails the
  `npm run deploy` pipeline if a forbidden domain reference appears
  in the static export.

[Unreleased]: ../../compare/v0.1.0...HEAD
[0.1.0]: ../../releases/tag/v0.1.0
