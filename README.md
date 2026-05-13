# Timechain Grid

**Bitcoin's digital real estate, block by block.**

A privacy-first, no-tracking 2D viewer of the Bitcoin chain. Every coin
ever mined occupies a tile on a deterministic spiral expanding from
Satoshi at the origin. Each block opens new tiles. Hover any cell to
see who owns it; press play and watch the map grow from genesis to
the live tip.

Live at **[timechaingrid.com](https://timechaingrid.com)**.

```
                  ██  ←  Miner 5
              ██  ████
            ████  ██████  ←  Miner 4
          ██████  ████████
        ████████  ██████████ █
       ██████████ ███████████ █
      ███████████ ████████████ █  ←  Miner 1
     ████████████  Satoshi  ██  ██
      ███████████ ████████████ █
       ██████████ ███████████ █
        ████████  ██████████ █
          ██████  ████████  ←  Miner 3
            ████  ██████
              ██  ████
                  ██  ←  Miner 2
```

## Quick start

```bash
npm install
npm run dev               # http://localhost:3000
```

The marquee surface is `/grid`. Document-style pages under `/`,
`/about`, `/pricing`, `/donate`, `/privacy`, `/status`, `/api`,
`/docs`, `/login`.

## Build & deploy

```bash
npm run build             # → out/   (static export, Cloudflare-Pages-ready)
npm run privacy-audit     # CI gate — fails if any forbidden third-party domain
                          # appears in out/. Run before every release.
npm run deploy            # next build && rm -rf out/blocks && wrangler pages deploy
```

The deploy target is a Cloudflare Pages project named `timechaingrid`,
bound to the `timechaingrid.com` custom domain.

## Generate per-block snapshots

```bash
npm run snapshot:generate    # public/blocks/ + public/wallets-bundle.json
npm run snapshot:validate    # schema + cross-reference check on the snapshot tree
```

Each block becomes a small JSON file under
`public/blocks/shard-NNN/BBBBBBB.json` carrying the minter, subsidy,
halving flag, role, and the spiral-index range of that block's new
coins. The browser canvas fetches these on demand to drive the
per-block narrative card.

To consume an operator-run real-substrate walker (advanced):

```bash
GRID_REAL_SUBSTRATE_DIR=/path/to/walker/out npm run snapshot:generate
```

If unset, the generator falls back to the synthetic 3,000-block
fixture used for the v0.1 demo.

## Privacy

Source data flows from Bitcoin's own peer-to-peer protocol into a
self-hosted full node operated independently of this repository.
Snapshots ship from a CDN bucket the project controls — **no
per-viewer telemetry, no third-party fonts, no analytics, no
tracking**. Verifiable in your browser's DevTools Network tab during
a full session.

The CI pipeline runs `scripts/privacy-audit.sh` against every build;
the deploy script bails if any forbidden third-party domain appears
in the static export.

## Tech stack

- **Framework:** Next.js 16 (App Router, static export to Cloudflare Pages)
- **Rendering:** PixiJS 8 (2D canvas)
- **State:** Zustand 5
- **Styling:** Tailwind CSS 4, cyber-steampunk dark palette, system fonts only
- **Testing:** Vitest 4 + React Testing Library

## Project layout

```
src/
├── app/                  Next.js App Router (route groups, layouts, globals.css)
│   ├── (site)/           document-style pages (/, /about, /pricing, …)
│   └── grid/             kiosk-mode viewer (/grid)
├── components/           NavBar, SiteFooter, BlockNarrative, BlockStats,
│                         WalletInspector, PlayerLeaderboard, Logo, …
│   └── views/            CoinGridView (the PIXI canvas)
├── data/                 BlockSnapshot client, ChainSubstrate fixture,
│                         BitcoinChainAdapter (CDN sidecar adapter)
├── lib/                  spiral, convex-hull, format, coords, role-visuals
├── store/                timegridStore.ts (Zustand)
└── types/                wallet, block, lattice, coin, substrate

chain-tools/              offline data pipeline (operator infra)
├── lib/                  chain.mjs (issuance math), schemas.py
├── ingest/               operator-side chain walker (planned scope)
├── physics/              force sim (sister-side)
└── snapshots/            generate-grid.mjs · validate.mjs

public/blocks/            per-block JSON snapshots (gitignored, regenerated)
public/wallets-bundle.json slim wallet bundle (gitignored, regenerated)
public/status.json        live tip + pipeline health sidecar
```

## Roadmap

- **v0.1 (current):** static lattice driven by operator-run snapshot
  pipeline, real-estate narrative, hover empire borders, narrate
  playback.
- **v0.2:** scale past the first halving (210,000 blocks). Real-time
  tip tracking. Coin-transfer model: ownership shifts move tile
  colors; displaced wallets get reseated.
- **v0.3:** subgrid fractional ownership (10× upsize for 0.01-BTC
  granularity). Common-input wallet clustering. Tor onion service.
- **v0.4:** developer API at `api.timechaingrid.com` for query +
  export workflows.

## Contributing

Pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
contributor workflow, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for
community standards. Security reports → [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) — see file for full text.

---

Built on the open Bitcoin protocol. No coin, no token, no funding round.
