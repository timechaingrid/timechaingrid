# bitcoind + electrs runbook (data ingest path A)

Concrete steps to provision the self-hosted Bitcoin Core + Electrs
indexer that feeds the eventual production parquet pipeline. This is
the implementation of **Option A** in `docs/bitcoin-data-ingest.md`
— the privacy-clean ingest path that lets timechaingrid.com /
timechaingraph.com stop relying on the FREE_TIER_50 fixture and start
showing real chain data.

> **Pre-flight**: per the user 2026-04-30 directive, v0.1 ships on
> the fixture. This runbook stages the v0.2+ infrastructure so the
> data pipeline can flip on once the operator commits to provisioning.

## Hardware target

Hetzner dedicated server is the recommended baseline. Specifically:

| Spec | Min | Recommended |
|---|---|---|
| Storage | 1 TB SSD | 2 TB NVMe |
| RAM | 16 GB | 32 GB |
| CPU | 4 cores | 8 cores |
| Bandwidth | 1 Gbps unmetered | unmetered |
| OS | Debian 12 / Ubuntu 22.04 | latest stable |

Cost: ~€55/month for an EX44 (Hetzner) or comparable. One-time
setup ~€100 KVM/install fee.

Storage budget breakdown:
  - bitcoind blockchain: ~700 GB (and growing ~5 GB/month)
  - electrs index: ~250 GB
  - chain-tools parquet output: ~10 GB
  - logs + slack: ~50 GB
  ≈ 1 TB minimum, 2 TB gives ~3 years of headroom

## Step 1 — Provision the host

Order through Hetzner Robot or Cloud. Pick Debian 12 (latest LTS).
Once IP is live:

```bash
ssh root@<server-ip>
adduser bitcoin
usermod -aG sudo bitcoin
mkdir /var/bitcoin && chown bitcoin:bitcoin /var/bitcoin
```

Harden SSH: disable password auth, install Fail2Ban, ufw allow only
SSH (22) + bitcoind P2P (8333). Block all other inbound.

## Step 2 — Install bitcoind

```bash
sudo -u bitcoin -i
cd /var/bitcoin
wget https://bitcoincore.org/bin/bitcoin-core-29.0/bitcoin-29.0-x86_64-linux-gnu.tar.gz
tar -xzf bitcoin-29.0-x86_64-linux-gnu.tar.gz
sudo install -m 0755 -o root -g root -t /usr/local/bin bitcoin-29.0/bin/*
```

Create `/var/bitcoin/.bitcoin/bitcoin.conf`:

```
# /var/bitcoin/.bitcoin/bitcoin.conf
server=1
txindex=1                  # required for electrs to index addresses
rpcuser=tcg
rpcpassword=<long-random>  # 32+ random alphanumeric
rpcport=8332
rpcallowip=127.0.0.1
rpcbind=127.0.0.1
prune=0                    # full archival; electrs needs it
listen=1
maxconnections=40
dbcache=4000               # GB — speeds up initial sync
```

Generate the password:

```bash
openssl rand -hex 32
```

systemd unit at `/etc/systemd/system/bitcoind.service`:

```ini
[Unit]
Description=Bitcoin Core
After=network.target

[Service]
User=bitcoin
Group=bitcoin
ExecStart=/usr/local/bin/bitcoind -daemon=0 -conf=/var/bitcoin/.bitcoin/bitcoin.conf
ExecStop=/usr/local/bin/bitcoin-cli stop
Restart=on-failure
TimeoutStopSec=60min
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now bitcoind
sudo journalctl -u bitcoind -f
```

Initial sync: 24-48 hours. Verify progress:

```bash
sudo -u bitcoin bitcoin-cli -conf=/var/bitcoin/.bitcoin/bitcoin.conf getblockchaininfo
```

Look for `verificationprogress: 1.0` and `initialblockdownload: false`.

## Step 3 — Install electrs

electrs (the Romanian Electrum server) is the address index over
bitcoind:

```bash
sudo apt install -y cargo libsqlite3-dev clang cmake
git clone --depth 1 https://github.com/romanz/electrs /var/bitcoin/electrs
cd /var/bitcoin/electrs
cargo build --release --locked
```

`/var/bitcoin/electrs/electrs.toml`:

```toml
network = "bitcoin"
db_dir = "/var/bitcoin/electrs/db"
daemon_dir = "/var/bitcoin/.bitcoin"
daemon_rpc_addr = "127.0.0.1:8332"
electrum_rpc_addr = "127.0.0.1:50001"
log_filters = "INFO"
```

systemd unit at `/etc/systemd/system/electrs.service`:

```ini
[Unit]
Description=Electrs indexer
After=bitcoind.service
Requires=bitcoind.service

[Service]
User=bitcoin
ExecStart=/var/bitcoin/electrs/target/release/electrs --conf /var/bitcoin/electrs/electrs.toml
Restart=on-failure
RestartSec=30s

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now electrs
sudo journalctl -u electrs -f
```

First-pass index build: 6-12 hours after bitcoind is at tip.

## Step 4 — Wire the chain-tools pipeline

The Python scripts in `chain-tools/ingest/` are scaffolded with
`NotImplementedError`. They become operational against the running
bitcoind + electrs.

```bash
git clone https://github.com/timechaingrid/timechaingrid /var/bitcoin/timechaingrid
cd /var/bitcoin/timechaingrid/chain-tools/ingest
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Implement `extract_wallets.py`:

```python
# Pseudocode — replaces NotImplementedError stubs
import bitcoinrpc.authproxy as rpc
client = rpc.AuthServiceProxy(f"http://tcg:<pw>@127.0.0.1:8332")

# 1. Walk every address ever seen via electrs
# 2. For each, compute firstSeenBlock, lastActiveBlock,
#    totalReceivedSats, txCount, isMiner via RPC
# 3. Apply significance_filter.is_significant
# 4. Write wallets.parquet (pyarrow)
```

Implement `extract_activity.py`:

```python
# 1. Walk blocks 0..tip via getblock + getrawtransaction
# 2. For each block: emit activity/<height>.json sidecar with
#    wallet-spawn + bond-form + halving events
# 3. Aggregate per-block bonds → bonds.parquet
# 4. Emit coins.parquet for the Grid view's substrate
```

These are ~300-500 LOC each. Sketches in the script headers.

## Step 5 — Push artifacts to R2

```bash
# One-time R2 setup (Cloudflare dashboard):
#   - Create bucket: timechain-data
#   - Enable public access
#   - Bind custom domain: data.timechaingrid.com
#   - CORS: AllowedOrigins https://timechaingrid.com,
#           https://timechaingraph.com

# Per-deploy:
cd /var/bitcoin/timechaingrid
bash chain-tools/deploy/push_to_r2.sh
```

The web canvas's `BitcoinChainAdapter` reads from
`NEXT_PUBLIC_CDN_BASE` (set to `https://data.timechaingrid.com` in
Cloudflare Pages env vars) — flipping the env var swaps the runtime
data source from the public/status.json fixture to live R2.

## Step 6 — Schedule regeneration

Cron entry on the bitcoind host (NOT in local assistant tooling):

```
# crontab -u bitcoin -e
# Regenerate parquet every 6 hours; push to R2 if new tip detected
0 */6 * * * cd /var/bitcoin/timechaingrid && \
  python3 chain-tools/ingest/extract_wallets.py && \
  python3 chain-tools/ingest/extract_activity.py && \
  bash chain-tools/deploy/push_to_r2.sh \
  >> /var/log/timechain-pipeline.log 2>&1
```

6-hour cadence is loose enough to bound CPU + bandwidth; tighten
to hourly once perf is profiled and bandwidth costs are understood.

## Verification checklist

- [ ] `bitcoin-cli getblockcount` returns current tip height (~876k+)
- [ ] `electrs` log shows `index up to date`
- [ ] `extract_wallets.py` produces `wallets.parquet` with 10k+ rows
- [ ] `extract_activity.py` produces `coins.parquet` and `bonds.parquet`
- [ ] R2 bucket lists the artifacts at `data.timechaingrid.com/wallets.parquet`
- [ ] Browser DevTools shows the viewer fetching from `data.timechaingrid.com` instead of `/status.json`
- [ ] CI privacy-audit still passes (no Google/Stripe/etc. third-parties leaked)

When all pass, the v0.2+ data flip is complete and the fixture-data
amber pill in the HUD comes off.

## Decisions that need your call before this runbook executes

1. **Hetzner vs alternative provisioning** — home rig (cheaper, more
   ops), Vultr / Linode (similar cost, different geography), or
   self-host on existing hardware?
2. **Domain for R2 bucket** — `data.timechaingrid.com` is the default
   recommendation; could also be `data.timechain.tools` or another
   subdomain.
3. **Cron cadence** — 6 hours / 1 hour / per-block? Per-block requires
   a ZeroMQ subscription to bitcoind's `blockhash` topic; more
   complex but live.
4. **Backup strategy** — bitcoind blockchain is reproducible from P2P
   sync, but losing electrs index = 6+ hours of rebuild. Worth
   periodic snapshots? Hetzner offers automated backups for ~10% of
   server cost.

Pause for these decisions before commissioning.
