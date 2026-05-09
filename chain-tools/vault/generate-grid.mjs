#!/usr/bin/env node
// chain-tools/vault/generate-grid.mjs
//
// Vault generator for the Grid view (coin-real-estate substrate).
// Reads optional operator-run real-substrate output if available;
// otherwise emits a deterministic synthetic fixture. Output is consumed
// by the Next.js viewer (per-block JSON snapshots + slim wallet bundle
// + status sidecar) and by an optional Obsidian vault under vault-grid/.
//
// This generator emits:
//
//   vault-grid/
//   ├── README.md                     (vault overview + usage)
//   ├── INDEX.md                      (curated coin index)
//   ├── SUMMARY.md                    (aggregate stats)
//   ├── coins/
//   │   ├── genesis/                  (Satoshi's first 50 coins as curated md)
//   │   │   ├── B0I0.md ... B0I49.md
//   │   ├── halvings/                 (placeholder — no halvings in first 1k blocks)
//   │   └── notable/                  (placeholder)
//   ├── blocks/
//   │   └── genesis.md                (block 0 narrative anchor)
//   ├── prolog/
//   │   ├── all.pl                    (master loader)
//   │   ├── facts/
//   │   │   └── coins.pl              (auto-gen: one coin/5 fact per coin)
//   │   └── rules/                    (hand-authored, tracked via gitignore carve-out)
//   │       └── coins.pl              (coin-flavored lemmas)
//   └── spiral-index.json             (compact full coin roster)
//
// vault-grid/ is gitignored (per the same user directive that
// gitignored vault/), with the rules/ subtree as a carve-out.
//
// For v0.1 the roster covers blocks 0..999 (50,000 coins — Phase 1
// of the genesis-through-first-epoch expansion). Full first epoch
// (210k blocks → 10.5M coins) requires the v0.2+ adapter pipeline
// reading from real bitcoind/electrs.
//
// fixture-sync: this script duplicates the wallet-synthesis logic
// from src/data/__fixtures__/free-tier-50.ts. The spiral coordinate
// math is local (Grid-specific concept). The subsidy schedule is
// imported from chain-tools/lib/chain.mjs (upstream shared
// substrate-math lib) — single source of truth across both
// generators.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { subsidyBtcAt, TIP_BLOCK } from '../lib/chain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VAULT_ROOT = path.join(REPO_ROOT, 'vault-grid');
const PUBLIC_BLOCKS_ROOT = path.join(REPO_ROOT, 'public', 'blocks');

// ---------- vault scope vs snapshot scope -----------------------------------
//
// The vault content (markdown coins, prolog facts, spiral-index.json)
// stays bounded at TARGET_THROUGH_BLOCK to keep file counts and Obsidian
// indexing tractable. Per-block JSON snapshots (the viewer's data feed)
// extend all the way to the operator's substrate tip when operator's
// real-substrate is reachable — that's how the canvas can play forward
// past the vault scope into real chain history.
//
// MUST stay aligned with DEMO_BLOCK_COUNT in
// src/data/__fixtures__/coin-roster.ts (same shape, same range).
const TARGET_THROUGH_BLOCK = 2999;

// ---------- real-substrate reader (operator-run) ----------------------------
//
// When an operator runs a real-chain substrate walker, this generator
// can read its output to drive two things:
//   1. Per-block coinbase miner addresses — the walker assigns one fresh
//      miner wallet per block (firstSeenBlock keyed). 1:1 mapping with
//      rare same-block duplicates and ~0.2% gap blocks (returning
//      miners) which we resolve by reusing the previous block's miner.
//   2. The chain tip — extends per-block snapshot generation past the
//      hard-coded TARGET_THROUGH_BLOCK out to the real walker tip.
//
// Path is configured by the GRID_REAL_SUBSTRATE_DIR env variable. When
// unset (default), we transparently fall back to the synthetic
// MockMiner pool so the generator works in isolation. Expected files
// inside the dir:
//   - real-substrate-meta.json
//   - real-substrate-wallets.jsonl
//   - real-substrate-timestamps.json (optional)
const REAL_SUBSTRATE_DIR = process.env.GRID_REAL_SUBSTRATE_DIR;
const REAL_META_PATH = REAL_SUBSTRATE_DIR
  ? path.join(REAL_SUBSTRATE_DIR, 'real-substrate-meta.json')
  : null;
const REAL_WALLETS_PATH = REAL_SUBSTRATE_DIR
  ? path.join(REAL_SUBSTRATE_DIR, 'real-substrate-wallets.jsonl')
  : null;
const REAL_TIMESTAMPS_PATH = REAL_SUBSTRATE_DIR
  ? path.join(REAL_SUBSTRATE_DIR, 'real-substrate-timestamps.json')
  : null;

async function readRealSubstrate() {
  if (!REAL_META_PATH || !REAL_WALLETS_PATH) return null;
  if (!fs.existsSync(REAL_META_PATH) || !fs.existsSync(REAL_WALLETS_PATH)) {
    return null;
  }
  const meta = JSON.parse(fs.readFileSync(REAL_META_PATH, 'utf-8'));
  // Timestamps file is small (~5 MB JSON object keyed by block height
  // → ISO string). One-shot parse is faster than streaming for the
  // tip-time lookup we need. Optional — falls through to undefined
  // when the walker hasn't produced it yet.
  let tipBlockTimeMs;
  if (REAL_TIMESTAMPS_PATH && fs.existsSync(REAL_TIMESTAMPS_PATH)) {
    try {
      const timestamps = JSON.parse(fs.readFileSync(REAL_TIMESTAMPS_PATH, 'utf-8'));
      const iso = timestamps[String(meta.tipBlock)];
      if (typeof iso === 'string') {
        tipBlockTimeMs = Date.parse(iso);
      }
    } catch {
      // Treat any parse failure as "no tip-time available" — the
      // status sidecar still gets written with a sensible fallback.
    }
  }
  // Stream the wallets file (~600 MB) line-by-line. Two passes in one
  // sweep:
  //   1. blockMinters — Map<firstSeenBlock, {address, role}> for the
  //      per-block snapshot's coinbase attribution. ~157k miner entries
  //      × ~50 bytes = ~8 MB resident.
  //   2. walletBundle — slim WalletData[] capped to wallets first-seen
  //      within the vault content scope (firstSeenBlock <= TARGET_
  //      THROUGH_BLOCK). Drives the v0.2 grid-side adapter
  //      (BitcoinChainAdapter.getNodes) without shipping the 600 MB
  //      file to the browser. ~3k wallets × ~150 bytes = ~450 KB on
  //      disk; gzipped ~80 KB over the wire.
  const blockMinters = new Map();
  const walletBundle = [];
  const stream = fs.createReadStream(REAL_WALLETS_PATH, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof row.firstSeenBlock !== 'number') continue;
    if (typeof row.address !== 'string') continue;
    if (row.isMiner === true && !blockMinters.has(row.firstSeenBlock)) {
      // First write wins — wallets.jsonl is in firstSeenBlock order, so
      // the earliest miner record per block is the canonical coinbase
      // recipient. ~6k duplicate blocks (same-block secondary miner
      // wallets) get ignored without affecting the per-block attribution.
      blockMinters.set(row.firstSeenBlock, {
        address: row.address,
        role: typeof row.role === 'string' ? row.role : 'miner',
      });
    }
    if (row.firstSeenBlock <= TARGET_THROUGH_BLOCK) {
      walletBundle.push({
        address: row.address,
        role: typeof row.role === 'string' ? row.role : (row.isMiner ? 'miner' : 'dust'),
        firstSeenBlock: row.firstSeenBlock,
        lastActiveBlock:
          typeof row.lastActiveBlock === 'number' ? row.lastActiveBlock : row.firstSeenBlock,
        totalReceivedSats:
          typeof row.totalReceivedSats === 'string'
            ? row.totalReceivedSats
            : String(row.totalReceivedSats ?? '0'),
        txCount: typeof row.txCount === 'number' ? row.txCount : 0,
        isMiner: Boolean(row.isMiner),
      });
    }
  }
  return { meta, blockMinters, walletBundle, tipBlockTimeMs };
}

const SUBSTRATE = await readRealSubstrate();
const SUBSTRATE_AVAILABLE = SUBSTRATE !== null;
const SNAPSHOT_THROUGH_BLOCK = SUBSTRATE_AVAILABLE
  ? Number(SUBSTRATE.meta.tipBlock)
  : TARGET_THROUGH_BLOCK;

// ---------- spiral lib (Grid-specific; mirror of src/lib/spiral.ts) ---------

function spiralCoord(n) {
  if (n === 0) return [0, 0];
  const k = Math.ceil((Math.sqrt(n + 1) - 1) / 2);
  const innerCount = (2 * k - 1) * (2 * k - 1);
  const ringIndex = n - innerCount;
  const sideLength = 2 * k;
  const side = Math.floor(ringIndex / sideLength);
  const stepInSide = ringIndex % sideLength;
  switch (side) {
    case 0: return [k, -k + 1 + stepInSide];
    case 1: return [k - 1 - stepInSide, k];
    case 2: return [-k, k - 1 - stepInSide];
    case 3: return [-k + 1 + stepInSide, -k];
    default: return [0, 0];
  }
}

// ---------- fixture re-synthesis (mirror of FREE_TIER_50) -------------------

const SATOSHI_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

function mockAddress(prefix, n) {
  const indexed = `${prefix}${String(n).padStart(3, '0')}`;
  const padding = 'X'.repeat(34 - indexed.length - 1);
  return `1${indexed}${padding}`;
}

function buildMiner(prefix, count, base) {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    return {
      address: mockAddress(prefix, i + 1),
      role: 'miner',
      firstSeenBlock: Math.floor(base.firstSeen + (TIP_BLOCK - base.firstSeen) * t * 0.05),
      lastActiveBlock: Math.floor(base.lastActive - (TIP_BLOCK - base.lastActive) * t * 0.05),
      isMiner: true,
    };
  });
}

const MINERS = buildMiner('MockMiner', 5, {
  firstSeen: 100, lastActive: 876_000,
});

// ---------- coin roster ------------------------------------------------------

/**
 * SATOSHI_ERA_BLOCKS — the first N blocks attributed to Satoshi
 * (Patoshi cluster mirror). MUST stay in sync with the same constant
 * in `src/data/__fixtures__/coin-roster.ts` so the web canvas and
 * the vault-grid generator agree on history.
 */
const SATOSHI_ERA_BLOCKS = 750;

/**
 * Each non-Satoshi miner mines MINER_RUN_LENGTH consecutive blocks
 * before the next miner takes over. Gives every miner a contiguous
 * spiral arc rather than scattered cells. MUST stay in sync with
 * src/data/__fixtures__/coin-roster.ts.
 */
const MINER_RUN_LENGTH = 50;

// pickMinerForBlock — when operator's real-substrate is available we
// prefer the per-block miner address + role from her walker (real-
// chain truth). For ~261 gap blocks (returning miners) we cascade to
// the previous block's miner — mining-pool continuation is the
// realistic shape. Falls through to the legacy SATOSHI_ERA + round-
// robin MockMiner pool only when the operator substrate is unreachable.
//
// Returns { address, role } so the per-block snapshot can carry the
// role through to the canvas role-color renderer without a second
// wallets-table lookup at runtime.
let lastKnownMiner = null;
function pickMinerForBlock(blockHeight) {
  if (SUBSTRATE_AVAILABLE) {
    const real = SUBSTRATE.blockMinters.get(blockHeight);
    if (real) {
      lastKnownMiner = real;
      return real;
    }
    if (lastKnownMiner) return lastKnownMiner;
    // Genesis-area gaps fall through to Satoshi until the first real
    // miner record is seen — guarantees a stable address + role even
    // before any minter has been seen.
    return { address: SATOSHI_ADDRESS, role: 'satoshi' };
  }
  if (blockHeight < SATOSHI_ERA_BLOCKS) {
    return { address: SATOSHI_ADDRESS, role: 'satoshi' };
  }
  const minerOffset = blockHeight - SATOSHI_ERA_BLOCKS;
  const minerIdx =
    Math.floor(minerOffset / MINER_RUN_LENGTH) % MINERS.length;
  return { address: MINERS[minerIdx].address, role: 'miner' };
}

function mintCoinsThroughBlock(maxBlock) {
  // Per user directive 2026-04-30: a single global spiral from
  // origin outward. No separate empire centers — overlapping was
  // a bug. Every coin lands at a unique cell, contiguous miners
  // (via MINER_RUN_LENGTH) get tight spiral arcs.
  const coins = [];
  let spiralIndex = 0;
  for (let block = 0; block <= maxBlock; block += 1) {
    const subsidy = subsidyBtcAt(block);
    if (subsidy === 0) break;
    const { address: minterAddress } = pickMinerForBlock(block);
    const isHalving = block > 0 && block % 210_000 === 0;
    for (let i = 0; i < subsidy; i += 1) {
      const [x, y] = spiralCoord(spiralIndex);
      coins.push({
        id: `B${block}I${i}`,
        mintedAtBlock: block,
        mintedIndex: i,
        minterAddress,
        ownerAddress: minterAddress,
        spiralIndex,
        gridX: x,
        gridY: y,
        isHalving,
      });
      spiralIndex += 1;
    }
  }
  return coins;
}

const COINS = mintCoinsThroughBlock(TARGET_THROUGH_BLOCK);

// ---------- helpers ----------------------------------------------------------

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(rel, body) {
  const full = path.join(VAULT_ROOT, rel);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, body);
}

// writePublic — emit a file under public/, served by Next.js at the
// matching path (e.g., public/blocks/INDEX.json → /blocks/INDEX.json).
// Used for the per-block snapshot tree so the browser can fetch
// state lazily during playback.
function writePublic(rel, body) {
  const full = path.join(PUBLIC_BLOCKS_ROOT, rel);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, body);
}

function shortAddress(addr) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

function aliasFor(addr) {
  if (addr === SATOSHI_ADDRESS) return 'Satoshi';
  return shortAddress(addr);
}

// ---------- emit: per-coin markdown for genesis 50 only ---------------------

function genesisCoinMarkdown(coin) {
  const fm = [
    '---',
    `coinId: ${coin.id}`,
    `mintedAtBlock: ${coin.mintedAtBlock}`,
    `mintedIndex: ${coin.mintedIndex}`,
    `minterAddress: ${coin.minterAddress}`,
    `ownerAddress: ${coin.ownerAddress}`,
    `spiralIndex: ${coin.spiralIndex}`,
    `gridX: ${coin.gridX}`,
    `gridY: ${coin.gridY}`,
    `isHalving: ${coin.isHalving}`,
    'tags: [coin/genesis, owner/satoshi]',
    '---',
    '',
  ].join('\n');

  const isOrigin = coin.spiralIndex === 0;
  const title = isOrigin
    ? `# ${coin.id} — The Origin Coin`
    : `# ${coin.id} — Genesis ${coin.mintedIndex + 1} of 50`;

  const body = isOrigin
    ? [
        'The first coinbase output ever mined. Coordinate (0, 0) on the',
        'spiral lattice — the brass-gold center of timechaingrid.com',
        '2D real-estate panopticon. Anchors the origin forever.',
        '',
        `Minted to **Satoshi** (\`${SATOSHI_ADDRESS}\`) at block`,
        '[[genesis|Genesis]]. Currently still owned by Satoshi; no',
        'transfer history is modelled in v0 (every coin\'s',
        'ownerAddress equals its minterAddress until the v0.2+',
        'pipeline tracks per-tx spends).',
      ].join('\n')
    : [
        `Coinbase output ${coin.mintedIndex + 1} of 50 from the genesis`,
        `block. Sits at spiral coordinate (${coin.gridX}, ${coin.gridY}),`,
        `${coin.spiralIndex === 0 ? 'the origin' : 'ring ' + Math.max(Math.abs(coin.gridX), Math.abs(coin.gridY))}`,
        'on the lattice.',
        '',
        `Originally minted to **Satoshi** (\`${SATOSHI_ADDRESS}\`) at`,
        'block [[genesis|Genesis]] alongside the other 49 genesis coins.',
      ].join('\n');

  return [
    fm,
    title,
    '',
    body,
    '',
    '## Lineage',
    '',
    `- Block: [[genesis|Genesis Block]]`,
    `- Owner: **${aliasFor(coin.ownerAddress)}** (\`${coin.ownerAddress}\`)`,
    coin.spiralIndex < 49
      ? `- Next: [[B${coin.mintedAtBlock}I${coin.mintedIndex + 1}]]`
      : '',
    coin.spiralIndex > 0
      ? `- Prev: [[B${coin.mintedAtBlock}I${coin.mintedIndex - 1}]]`
      : '',
    '',
  ].filter(Boolean).join('\n') + '\n';
}

let genesisCoinFiles = 0;
for (const coin of COINS.filter((c) => c.mintedAtBlock === 0)) {
  writeFile(`coins/genesis/${coin.id}.md`, genesisCoinMarkdown(coin));
  genesisCoinFiles += 1;
}

// ---------- emit: block 0 narrative ------------------------------------------

writeFile(
  'blocks/genesis.md',
  [
    '---',
    'block: 0',
    'kind: genesis',
    'epoch: 0',
    'subsidyBtc: 50',
    'dateApprox: 2009-01-03',
    'tags: [block, genesis, epoch/0]',
    '---',
    '',
    '# Genesis · Block 0',
    '',
    'The genesis block, mined 2009-01-03 by the entity known as',
    'Satoshi Nakamoto. Coinbase reward 50 BTC, paid to the',
    `**Satoshi** (\`${SATOSHI_ADDRESS}\`) address — unspendable by protocol`,
    'convention.',
    '',
    'On the Grid view, this is where the lattice begins: 50 coins',
    'occupy spiral indices 0..49, with [[B0I0]] at the origin and',
    'the rest filling ring 1 (indices 1..8) and ring 2 (indices',
    '9..24) as block 0\'s coinbase output spreads outward.',
    '',
    '## Coins minted',
    '',
    ...Array.from({ length: 50 }, (_, i) => `- [[B0I${i}]]`),
    '',
  ].join('\n'),
);

// ---------- emit: README, INDEX, SUMMARY ------------------------------------

const totalBlocks = TARGET_THROUGH_BLOCK + 1;
const totalCoins = COINS.length;

writeFile(
  'README.md',
  [
    '# Timechain Grid — Coin Vault',
    '',
    '*The 2D real-estate substrate for `timechaingrid.com`.*',
    '',
    'Auto-generated by `chain-tools/vault/generate-grid.mjs`. Each',
    'coin minted by the Bitcoin issuance schedule occupies one cell',
    'of the spiral lattice expanding outward from Satoshi at the',
    'origin. Open this folder in Obsidian to browse the curated',
    'coin narratives + halving + notable-block notes; query the',
    'Prolog fact base for programmatic ownership/coordinate queries.',
    '',
    '## Scope',
    '',
    `- v0.1 fixture: blocks 0..${TARGET_THROUGH_BLOCK} = ${totalCoins.toLocaleString()} coins.`,
    '- Genesis-through-first-epoch (v0.2+ target): blocks 0..209,999 = 10,500,000 coins.',
    '- All current owners are minters (no transfer history modelled until the v0.2+ ingest pipeline).',
    '',
    '## Layout',
    '',
    '```',
    'vault-grid/',
    '├── README.md           (this file)',
    '├── INDEX.md            (curated coin index)',
    '├── SUMMARY.md          (aggregate stats)',
    '├── coins/genesis/      (50 markdown files for Satoshi\'s first 50 coins)',
    '├── coins/halvings/     (placeholder — no halvings in first 1k blocks)',
    '├── coins/notable/      (placeholder)',
    '├── blocks/genesis.md   (block-0 narrative anchor)',
    '├── prolog/             (Prolog fact base + hand-authored rules)',
    '│   ├── all.pl',
    '│   ├── facts/coins.pl  (auto-gen: ' + totalCoins.toLocaleString() + ' coin/5 facts)',
    '│   └── rules/coins.pl  (hand-authored, gitignore carve-out)',
    '└── spiral-index.json   (compact full coin roster)',
    '```',
    '',
    '## Prolog usage',
    '',
    '```bash',
    'swipl prolog/all.pl',
    '?- coin(Id, 0, _, Owner, _).         % All genesis coins.',
    '?- coin(_, _, _, Owner, _), \\+ coin(_, _, _, Owner, 0).  % Coins owned by anyone but genesis-spiral-zero.',
    '?- findall(C, coin(C, 0, _, _, _), Cs), length(Cs, N).    % Count of genesis coins (50).',
    '```',
    '',
    '## Fixture-sync',
    '',
    'The generator duplicates wallet/bond synthesis from',
    '`src/data/__fixtures__/free-tier-50.ts` + spiral logic from',
    '`src/lib/spiral.ts`. If either source changes, sync',
    '`chain-tools/vault/generate-grid.mjs` and re-run.',
    '',
  ].join('\n'),
);

writeFile(
  'INDEX.md',
  [
    '# Coin Index',
    '',
    `${totalCoins.toLocaleString()} coins minted across blocks 0..${TARGET_THROUGH_BLOCK} in this vault.`,
    '',
    '## Genesis (50)',
    '',
    `Block 0, Satoshi's coinbase output. [[blocks/genesis|Genesis Block]].`,
    '',
    ...Array.from({ length: 50 }, (_, i) => `- [[coins/genesis/B0I${i}]]`),
    '',
    '## Curated subsets (coming as the vault grows)',
    '',
    '- Halving cells (none yet — first halving is block 210,000)',
    '- Notable acquisitions (none modelled in v0; Phase G adds transfer history)',
    '',
  ].join('\n'),
);

const minterCounts = new Map();
for (const c of COINS) {
  minterCounts.set(c.minterAddress, (minterCounts.get(c.minterAddress) ?? 0) + 1);
}

writeFile(
  'SUMMARY.md',
  [
    '# Vault Summary',
    '',
    'Aggregate stats over the v0.1 vault content.',
    '',
    `- **Total coins**: ${totalCoins.toLocaleString()}`,
    `- **Block range**: 0..${TARGET_THROUGH_BLOCK} (${totalBlocks.toLocaleString()} blocks)`,
    `- **Subsidy**: 50 BTC per block (no halvings in this range)`,
    `- **Total BTC issued**: ${totalCoins} BTC = ${(totalCoins * 100_000_000).toLocaleString()} sats`,
    '',
    '## Coins per minter',
    '',
    ...Array.from(minterCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([addr, count]) =>
        `- ${aliasFor(addr)} (\`${addr}\`): ${count.toLocaleString()} coins`,
      ),
    '',
  ].join('\n'),
);

// ---------- emit: per-block state snapshots (block-state/v1) ----------------
//
// Per user directive 2026-04-30, every block in scope gets its own JSON
// state file. Storage is *delta-only*: each file describes what THAT
// BLOCK adds to the lattice (the new coin spiral-index range + which
// minter received them). To reconstruct the full state at block N,
// consume blocks 0..N — every coin's spiral coordinate is deterministic
// from its spiralIndex, so the renderer / vault browser doesn't need
// the full coin list per block, just the contiguous-range pointer.
//
// Filename layout: blocks/shard-NN/BBBBBBB.json
//   - Block index zero-padded to 7 digits (covers up to 10M blocks).
//   - Sharded into directories of BLOCK_SHARD_SIZE files each so no
//     single dir exceeds OS-friendly inode counts. A 80k-block dataset
//     becomes 80 shard dirs at default size 1000.
//
// Bonus: an INDEX.json at the top of blocks/ tells consumers the
// schema version, full scope, shard size, and a list of shards with
// per-shard block ranges — enabling fast random access without
// scanning 80k filenames.

const BLOCK_SHARD_SIZE = 1000;

function blockSnapshotsEmit() {
  // Walk blocks 0..TARGET_THROUGH_BLOCK sequentially, writing one
  // JSON per block. Schema block-state/v1: each snapshot describes
  // what the block adds to the global spiral (newCoinFromIndex is
  // the spiral index of the first new coin, equal to the cumulative
  // coin count BEFORE this block's mint). Consumers reconstruct
  // grid positions via `spiralCoord(newCoinFromIndex .. + newCoinCount - 1)`.
  let cumulativeCoinCount = 0;
  let cumulativeSupplyBtc = 0;
  const shardSummaries = new Map();
  let written = 0;

  for (let block = 0; block <= SNAPSHOT_THROUGH_BLOCK; block += 1) {
    const subsidy = subsidyBtcAt(block);
    if (subsidy === 0) break;
    const { address: minter, role: minterRole } = pickMinerForBlock(block);
    const halving = block > 0 && block % 210_000 === 0;
    const epoch = Math.floor(block / 210_000);
    const newCoinFromIndex = cumulativeCoinCount;
    const newCoinCount = subsidy;
    cumulativeCoinCount += subsidy;
    cumulativeSupplyBtc += subsidy;

    const snapshot = {
      schema: 'block-state/v2',
      block,
      minter,
      minterRole,
      subsidy,
      halving,
      epoch,
      newCoinFromIndex,
      newCoinCount,
      cumulativeCoinCount,
      cumulativeSupplyBtc,
    };

    const shardId = Math.floor(block / BLOCK_SHARD_SIZE);
    // 3-digit shard padding covers up to 1000 shards = 1M blocks at
    // BLOCK_SHARD_SIZE=1000, well past Bitcoin's projected lifetime
    // chain length. 7-digit block padding gives a stable sortable
    // filename across the entire range.
    const shardName = `shard-${String(shardId).padStart(3, '0')}`;
    const blockPadded = String(block).padStart(7, '0');
    const body = JSON.stringify(snapshot) + '\n';
    // Compact JSON (no indentation) — keeps the on-disk size small
    // while remaining git-friendly (one block per line of stable
    // structure). At 80k blocks, compact saves ~50% vs. indented.
    //
    // Dual-write: the canonical home is `vault-grid/blocks/...` (the
    // Obsidian vault destination), and a mirrored copy lives under
    // `public/blocks/...` so Next.js serves them at /blocks/... for
    // the browser canvas to fetch during playback. ~200 bytes per
    // block × 1000 blocks = 200 KB doubled — trivial.
    writeFile(`blocks/${shardName}/${blockPadded}.json`, body);
    writePublic(`${shardName}/${blockPadded}.json`, body);

    const summary = shardSummaries.get(shardId) ?? {
      id: shardId,
      fromBlock: block,
      throughBlock: block,
      fileCount: 0,
    };
    summary.throughBlock = block;
    summary.fileCount += 1;
    shardSummaries.set(shardId, summary);
    written += 1;
  }

  // Top-level index for fast random access.
  const shards = Array.from(shardSummaries.values()).sort(
    (a, b) => a.id - b.id,
  );
  const index = {
    schema: 'block-state-index/v1',
    generated: new Date().toISOString(),
    scope: {
      fromBlock: 0,
      throughBlock: SNAPSHOT_THROUGH_BLOCK,
      totalBlocks: written,
    },
    shardSize: BLOCK_SHARD_SIZE,
    shards,
  };
  const indexBody = JSON.stringify(index, null, 2) + '\n';
  writeFile('blocks/INDEX.json', indexBody);
  writePublic('INDEX.json', indexBody);

  return { written, shards };
}

const blockEmit = blockSnapshotsEmit();

// ---------- emit: status.json sidecar ---------------------------------------
//
// Every vault:generate run also refreshes /status.json so the LiveStatus
// HUD on /status reflects whatever block range we just emitted. Sourced
// from operator's real-substrate meta when reachable; falls through to a
// deterministic fallback otherwise. Output is intentionally minimal —
// LiveStatus's defensive parser ignores fields it doesn't recognize, so
// the sidecar can grow without breaking older readers.

const STATUS_JSON_PATH = path.join(REPO_ROOT, 'public', 'status.json');

function writeStatusJson() {
  const status = SUBSTRATE_AVAILABLE
    ? {
        currentBlock: SNAPSHOT_THROUGH_BLOCK,
        // lastBlockTime is the *chain time* of the tip block (when it
        // was mined on the live Bitcoin chain), not the wall-clock of
        // the snapshot run. The HUD's intent is "when did the latest
        // observed block happen", which is the chain answer.
        lastBlockTime:
          typeof SUBSTRATE.tipBlockTimeMs === 'number'
            ? SUBSTRATE.tipBlockTimeMs
            : null,
        nextBlockEtaMs: 600_000,
        snapshotGeneratedAt: SUBSTRATE.meta.generatedAt,
        freeTierNodeCount: 50,
        snapshotTier: 'real-chain-walker-v2',
        pipeline: {
          'chain-walker': 'running',
          'real-substrate': 'streaming',
          'snapshot-generator': 'on demand',
          r2: 'deploy pending',
        },
        note: `Auto-generated from chain-tools/vault/generate-grid.mjs. Sourced from the real-substrate walker (Graph-side, chain-tools/ingest). Substrate covers blocks 0..${SNAPSHOT_THROUGH_BLOCK.toLocaleString()}. Re-running npm run vault:generate refreshes this sidecar from the latest substrate meta.`,
      }
    : {
        currentBlock: TARGET_THROUGH_BLOCK,
        lastBlockTime: null,
        nextBlockEtaMs: 600_000,
        snapshotGeneratedAt: new Date().toISOString(),
        freeTierNodeCount: 50,
        snapshotTier: 'free-fixture',
        pipeline: {
          'chain-walker': 'absent',
          'real-substrate': 'absent',
          'snapshot-generator': 'on demand',
          r2: 'deploy pending',
        },
        note: 'Auto-generated from chain-tools/vault/generate-grid.mjs. Real substrate not reachable from this run — sidecar reflects the in-fixture demo scope only.',
      };
  fs.writeFileSync(STATUS_JSON_PATH, JSON.stringify(status, null, 2) + '\n');
  return status;
}

const statusEmit = writeStatusJson();

// ---------- emit: wallets-bundle.json (v0.2 adapter scaffolding) -----------
//
// Slim wallet bundle carved from operator's substrate, scoped to wallets
// first-seen within the vault range. Drives BitcoinChainAdapter.getNodes
// — the grid-side data path that until v0.1 returned []. The schema is
// the JSON form of WalletData (totalReceivedSats kept as a string for
// bigint-faithful round-trip in the browser).
//
// Why a bundle instead of the full 600 MB wallets.jsonl: the browser
// can't reasonably parse-or-render millions of wallets at runtime. The
// bundle gives us a fixed-scope artifact that mirrors the existing
// FREE_TIER_50 fixture's role in the v0.1 substrate, but with real
// addresses + real role metadata from the chain walker.

const WALLET_BUNDLE_PATH = path.join(REPO_ROOT, 'public', 'wallets-bundle.json');

function writeWalletBundle() {
  if (!SUBSTRATE_AVAILABLE) {
    // No real substrate → write an empty-but-valid bundle so the
    // adapter has a stable artifact to fetch in isolation. Schema
    // matches the populated case so consumers don't branch.
    const empty = {
      schema: 'wallet-bundle/v1',
      generated: new Date().toISOString(),
      scope: { fromBlock: 0, throughBlock: TARGET_THROUGH_BLOCK },
      sourcedFrom: 'absent',
      wallets: [],
    };
    fs.writeFileSync(WALLET_BUNDLE_PATH, JSON.stringify(empty, null, 2) + '\n');
    return empty;
  }
  const bundle = {
    schema: 'wallet-bundle/v1',
    generated: new Date().toISOString(),
    scope: { fromBlock: 0, throughBlock: TARGET_THROUGH_BLOCK },
    sourcedFrom: 'real-substrate-walker-v2',
    wallets: SUBSTRATE.walletBundle,
  };
  // Compact JSON: at thousands of wallets the indentation cost is
  // ~2× the data; the bundle is consumer-machine-read at runtime.
  fs.writeFileSync(WALLET_BUNDLE_PATH, JSON.stringify(bundle) + '\n');
  return bundle;
}

const walletEmit = writeWalletBundle();

// ---------- emit: spiral-index.json ------------------------------------------

const spiralIndex = {
  schema: 'spiral-index/v1',
  generated: new Date().toISOString(),
  scope: {
    fromBlock: 0,
    throughBlock: TARGET_THROUGH_BLOCK,
    totalCoins,
  },
  coins: COINS.map((c) => ({
    id: c.id,
    mintedAtBlock: c.mintedAtBlock,
    minterAddress: c.minterAddress,
    ownerAddress: c.ownerAddress,
    spiralIndex: c.spiralIndex,
    x: c.gridX,
    y: c.gridY,
  })),
};
writeFile('spiral-index.json', JSON.stringify(spiralIndex, null, 0) + '\n');

// ---------- emit: Prolog facts -----------------------------------------------

function prologEscape(s) {
  return s.replace(/'/g, "''");
}

const coinFacts = [
  '% Auto-generated by chain-tools/vault/generate-grid.mjs.',
  '% coin(CoinId, MintedAtBlock, MinterAddress, OwnerAddress, SpiralIndex).',
  '',
];
for (const c of COINS) {
  coinFacts.push(
    `coin('${c.id}', ${c.mintedAtBlock}, '${prologEscape(c.minterAddress)}', '${prologEscape(c.ownerAddress)}', ${c.spiralIndex}).`,
  );
}
coinFacts.push('');
writeFile('prolog/facts/coins.pl', coinFacts.join('\n'));

writeFile(
  'prolog/all.pl',
  [
    '% Master loader — consult to load the full Grid coin fact base.',
    "% Usage: swipl -t halt -g \"consult('vault-grid/prolog/all.pl'), halt\"",
    '',
    ":- consult('facts/coins.pl').",
    ":- consult('rules/coins.pl').",
    '',
  ].join('\n'),
);

// ---------- summary ----------------------------------------------------------

console.log('Grid vault generated:');
console.log(`  realSubstrate: ${SUBSTRATE_AVAILABLE ? `available (tip ${SNAPSHOT_THROUGH_BLOCK.toLocaleString()}, ${SUBSTRATE.blockMinters.size.toLocaleString()} per-block miners)` : 'absent — using synthetic MockMiner pool'}`);
console.log(`  totalCoins (vault scope ≤ ${TARGET_THROUGH_BLOCK}): ${totalCoins.toLocaleString()}`);
console.log(`  genesisMarkdown: ${genesisCoinFiles}`);
console.log(`  blockSnapshots: ${blockEmit.written.toLocaleString()} (blocks 0..${SNAPSHOT_THROUGH_BLOCK.toLocaleString()}, across ${blockEmit.shards.length} shard dir${blockEmit.shards.length === 1 ? '' : 's'})`);
console.log(`  spiralIndexEntries: ${spiralIndex.coins.length.toLocaleString()}`);
console.log(`  prologFacts: ${COINS.length.toLocaleString()}`);
console.log(`  statusJson: ${statusEmit.snapshotTier} · currentBlock ${statusEmit.currentBlock.toLocaleString()}`);
console.log(`  walletBundle: ${walletEmit.wallets.length.toLocaleString()} wallets (scope ≤ block ${TARGET_THROUGH_BLOCK})`);
