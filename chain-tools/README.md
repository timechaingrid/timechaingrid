# chain-tools

Operator-side data pipeline for **Timechain Grid**. Everything here runs on
infra the operator controls; the browser never talks to these tools at runtime —
they produce static artifacts the frontend loads. This is the privacy seam:
data flows P2P from Bitcoin's own protocol into the operator's node, and only
static, pre-built files reach the viewer. **No third-party indexer (no electrs),
no third-party API.**

## Current state (v0.1)

The live lattice is driven by the **snapshot generators**, which produce the
per-block JSON snapshots + slim wallet bundle the canvas reads:

```bash
npm run snapshot:generate   # chain-tools/vault/generate-grid.mjs
                            #   → public/blocks/* + public/wallets-bundle.json
npm run snapshot:validate   # chain-tools/vault/validate.mjs (schema + xref check)
```

Without an operator real-substrate, the generator emits a deterministic
synthetic fixture (the v0.1 demo). To feed a real operator walk:

```bash
GRID_REAL_SUBSTRATE_DIR=/path/to/walk/out npm run snapshot:generate
```

## Full operator pipeline (shared with the Graph sister)

The coin substrate is built by the same map-reduce pipeline the Graph sister
uses: bitcoind `getblock` (verbosity 3) → a combiner walk → DuckDB out-of-core
reduce → tiered **Parquet** bundle → Cloudflare R2 → browser DuckDB-Wasm. The
parquet **output contract** (column names + types every consumer reads against)
is `lib/schemas.py`.

## Directory layout

```
chain-tools/
├── ingest/
│   └── requirements.txt        Python deps (duckdb + pyarrow)
├── lib/
│   ├── chain.mjs               halving / subsidy / issuance math
│   └── schemas.py              pyarrow WALLETS/BONDS/COINS/ACTIVITY schemas (the contract)
├── vault/
│   ├── generate-grid.mjs       per-block snapshot generator (coin lattice)
│   ├── generate.mjs            shared vault projection
│   └── validate.mjs            snapshot schema + cross-reference validator
├── physics/                    EXPERIMENTAL Rust force-sim — not part of the
│                               v0.1 pipeline
└── deploy/
    └── push_to_r2.sh           upload the bundle to R2
```

## Prerequisites (operator)

1. **bitcoind** — own full node, JSON-RPC enabled (cookie auth). **No electrs.**
2. **Python venv** — `python3 -m venv chain-tools/.venv` then
   `chain-tools/.venv/bin/pip install -r chain-tools/ingest/requirements.txt`.
3. **Node 26+**.
