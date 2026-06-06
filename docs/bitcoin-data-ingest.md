# Bitcoin data ingest — options + contract

> **⚠️ SUPERSEDED (2026-06-06).** This planning doc predates the shipped
> pipeline and references the retired electrs/`extract_*.py` approach. The real
> path is bitcoind JSON-RPC → combiner walk → DuckDB reduce → tiered Parquet;
> see **`chain-tools/README.md`** (design) and `chain-tools/lib/schemas.py`
> (output contract). Kept for historical context.

Per user directive 2026-04-30: "max effort work on the setup, retrieving
correct bitcoin blockchain data to build this 2D real estate
chronological grid". This doc captures the options, the contract the
ingest pipeline must produce, and the decision that needs the user's
call before implementation begins.

The Grid view's data substrate is the **coin roster** (every BTC ever
mined, owner per coin). Sister's Graph view's substrate is the
**wallet roster** (every economically significant address, per-bond
edges). Same chain, two extracted projections.

## The contract

Whatever ingest path we pick must produce these artifacts on Cloudflare
R2 (or equivalent we control), consumed by `BitcoinChainAdapter`:

### 1. `wallets.parquet`

One row per economically significant address (free tier: ~10k whales +
miners). Schema:

```
address           string   (Bitcoin P2PKH/P2WPKH/P2TR, normalized)
firstSeenBlock    int32    (block where this address first received output)
lastActiveBlock   int32    (block of most-recent input or output)
totalReceivedSats int64    (lifetime cumulative received, sats)
txCount           int32    (lifetime tx count)
isMiner           bool     (ever received a coinbase)
role              string   (satoshi | miner | whale | significant | dust)
```

### 2. `coins.parquet` (Grid-side substrate)

One row per coinbase output minted across all blocks (~19.8M rows at
tip). Schema:

```
coinId         string   (B<block>I<index>)
mintedAtBlock  int32
mintedIndex    int8     (0..subsidy-1)
minterAddress  string   (coinbase recipient)
ownerAddress  string    (current owner — may differ from minter once transfers tracked; v0 = minter)
spiralIndex   int32     (deterministic from spiralCoord(cumulativeSubsidy(b-1) + i))
isHalving     bool      (block height % 210000 == 0 && height > 0)
```

For v0.1 free tier, restrict coins.parquet to the first 100 blocks
(5,000 rows); scale up as the renderer's perf budget allows.

### 3. `bonds.parquet` (Graph-side substrate)

One row per (sender, recipient) aggregate bond. Schema:

```
fromAddress       string
toAddress         string
totalSats         int64    (sum across all txs from→to)
txCount           int32
firstBlock        int32    (formation block)
lastBlock         int32    (most-recent activity)
```

### 4. `activity/<height>.json` (per-block sidecars)

Already shipped in mock form by `chain-tools/vault/generate.mjs`.
Production version emits one per block:

```json
{
  "block": 123456,
  "epoch": 61,
  "subsidyBtc": 12.5,
  "cumulativeSupplyBtc": 15832500,
  "events": [
    { "kind": "wallet-spawn", "address": "1...", "role": "miner", "isMiner": true },
    { "kind": "bond-form", "fromAddress": "1...", "toAddress": "1...", "sats": "..." },
    { "kind": "halving", "epoch": 4 }
  ]
}
```

### 5. `status.json`

Already shipped (mock fixture in `public/status.json`). Production
schema unchanged; values become live.

## Ingest options — user decision required

### Option A — Self-hosted bitcoind + electrs (canonical)

**Privacy-clean. Heavy. Verifiable.**

1. User provisions a server (Hetzner dedicated, Vultr, home rig).
   Specs: ≥ 1 TB SSD (700 GB bitcoind, 250 GB electrs), 16 GB RAM, fast
   network (P2P sync ~24-48h on first run).
2. Install bitcoind with `txindex=1`, sync to tip.
3. Install electrs alongside bitcoind, build address index.
4. The Python scripts in `chain-tools/ingest/` (currently scaffolded
   with `NotImplementedError`) become the extraction layer:
   - `extract_wallets.py` walks the address index, applies
     `significance_filter.is_significant()`, writes wallets.parquet
   - `extract_activity.py` walks the chain block-by-block, emits
     coins, bonds, and per-block activity sidecars
5. The Rust `chain-tools/physics/` runs the force-directed pre-bake
   for the Graph view's keyframes.
6. `chain-tools/deploy/push_to_r2.sh` uploads the artifacts.

**Cost:** ~$50-100/month for a Hetzner dedicated; one-time ~$200 if
home-rig. Time investment: ~2 days for first sync.

**Pros:** Zero third-party dependencies. Verifiable end-to-end. The
canonical path per the project's privacy posture
(per the project's privacy stance: "never accept 'just add this
CDN-hosted lib' if it can be self-hosted").

**Cons:** Requires user-managed infrastructure.

### Option B — Public block-archive download (snapshot ingest)

**Faster bootstrap. Lower privacy guarantee.**

1. Download a pre-extracted public snapshot:
   - **Forrest snowden's archive** (`forrestsnowden/blockchain-archives`)
   - **BitMEX research data dumps** (free, occasionally refreshed)
   - **Cantillon protocol dumps** (community-maintained)
2. Extract to local disk, run a Python pass to derive the contract
   schemas above.
3. Skip bitcoind; trust the snapshot publisher.

**Cost:** Bandwidth (~500 GB download) + a few hours of CPU.

**Pros:** No 24h sync wait. No infrastructure budget.

**Cons:** Trusts a third-party publisher. Snapshots stale by
download time. Not aligned with the project's privacy posture for
production deploy — acceptable for local dev / fixture-bootstrap
but should not be the production path.

### Option C — Privacy-preserving public RPC over Tor

**Compromise: privacy via Tor, no infra needed.**

1. Use a public bitcoind RPC endpoint accessed only via Tor
   (e.g., Umbrel-published nodes, Mempool's onion service).
2. Extract via Python with Tor SOCKS proxy.
3. Slow (Tor overhead) but identity-blind to the operator.

**Pros:** No own infrastructure; privacy preserved for the data
operator (us). Reasonable middle ground.

**Cons:** Slow. Trust-but-verify model on the third-party node.
Privacy preserved against them but not as airtight as own bitcoind.

### Option D — Stay on enriched fixture for v0.1, defer real data to v0.2+

**Ship the visualisation now, real data after v0.1 launches.**

1. Continue using the FREE_TIER_50 mock (50 wallets) + COIN_ROSTER_DEMO
   (5,000 coins from first 100 blocks) for the v0.1 launch.
2. Document the ingest contract clearly so the v0.2+ pipeline has an
   exact target.
3. Augment the fixture incrementally with hand-curated real wallets
   (Satoshi confirmed; add Mt.Gox cold wallet, Binance cold wallet,
   Coinbase, etc.) for richer demo content without an ingest pipeline.

**Pros:** No infrastructure dependency. Ships v0.1 immediately. Demo
quality already strong.

**Cons:** Not "real Bitcoin data" yet. Defers the headline pitch.

## Recommendation

**Hybrid: D for v0.1 launch, A for v0.2+.**

1. Continue FREE_TIER_50 + COIN_ROSTER_DEMO mocks for v0.1; ship
   timechaingrid.com + timechaingraph.com publicly with clear
   "in development — fixture data" markers in the HUDs.
2. In parallel: user provisions bitcoind + electrs (Hetzner
   recommended). Once synced, the Python scripts in
   `chain-tools/ingest/` graduate from `NotImplementedError` stubs
   to working extraction.
3. v0.2 release replaces fixture imports with `BitcoinChainAdapter`
   reads against R2-hosted parquet.

Option B is acceptable as a one-shot bootstrap for the operator's
own bitcoind: download a snapshot, validate against P2P sync, then
operate self-hosted from there.

## Critical decisions that need your call

1. **Which option (A / B / C / D / hybrid)?**
2. **If A or hybrid:** which hosting target — Hetzner dedicated,
   home rig, other?
3. **R2 bucket name / DNS** — `data.timechaingrid.com` recommended;
   could also be `data.timechain.tools` or similar.
4. **Coin roster scope for v0.1 visual:** stay at first 100 blocks
   (5,000 coins) or scale to first epoch (210k blocks → 10.5M coins)?
   The renderer needs viewport culling above ~50k coins.

Once decisions land, this doc gets demoted into an executed runbook
with concrete commands; until then it is the staging area for the
options.
