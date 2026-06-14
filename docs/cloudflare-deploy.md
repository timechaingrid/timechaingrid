# Cloudflare deploy — Timechain Grid

Steps to wire `timechaingrid.com` (already registered on Cloudflare per
the project's launch notes) to a Cloudflare Pages project that builds
from `github.com/timechaingrid/timechaingrid`. Companion project
at `timechaingraph.com` follows the symmetric path with `timechaingraph`
substituted everywhere.

The repo's `npm run deploy` already does
`next build && wrangler pages deploy out --project-name=timechaingrid --branch=main`
for one-shot manual deploys. The flow below sets up **automatic deploys
on every `main` push**, plus the apex domain binding.

> **Order matters.** Step A (GitHub integration) creates the Pages
> project; Step B (custom domain) binds the apex; Step C (env vars)
> fixes the build-hash in the footer. Do A → B → C; D and E are
> optional polish.

---

## A. Connect the GitHub repo to Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create application** →
   **Pages** → **Connect to Git**.
2. Authorize the Cloudflare GitHub app for the
   `timechaingrid/timechaingrid` repo specifically (don't grant
   org-wide access — least privilege).
3. Begin setup:
   - **Project name:** `timechaingrid`  *(matches the deploy script)*
   - **Production branch:** `main`
   - **Framework preset:** **Next.js (Static HTML Export)**
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
   - **Root directory:** `/`
4. Click **Save and Deploy**. Cloudflare pulls the repo, runs the
   build, and serves the output at
   `https://timechaingrid.pages.dev/`.

   First build should be green; same gates that pass locally
   (`typecheck → lint → test:run → build → privacy-audit`) run via the
   GitHub Actions CI before Cloudflare ever pulls.

If the project `timechaingrid` already exists (from earlier
`wrangler pages deploy` runs), instead use **Settings → Builds &
deployments → Connect to Git** to attach it to the GitHub repo
without recreating it.

## B. Bind the custom domain `timechaingrid.com`

1. Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter `timechaingrid.com` (apex, no `www`).
3. Cloudflare detects the domain is on its DNS and proposes the
   correct CNAME target automatically. Accept it.
4. Wait for DNS propagation + cert issuance (typically <2 min on
   Cloudflare-hosted domains).
5. Repeat for the `www` subdomain if desired:
   - Add `www.timechaingrid.com` as a second custom domain
   - Set up a redirect rule: `www.timechaingrid.com/*` →
     `https://timechaingrid.com/$1` (301 permanent)

After this step, `https://timechaingrid.com` serves the static export.

## C. Build-time environment variables

The footer displays `v{NEXT_PUBLIC_BUILD_VERSION} · {NEXT_PUBLIC_BUILD_HASH}`.
Without these env vars, both fall back to `dev`. Cloudflare exposes
the commit SHA + branch automatically — wire them through.

In **Pages project → Settings → Environment variables → Production**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_BUILD_HASH` | `${CF_PAGES_COMMIT_SHA}` |
| `NEXT_PUBLIC_BUILD_VERSION` | `0.0.1` *(or read latest tag — see note)* |

> Cloudflare auto-injects `CF_PAGES_COMMIT_SHA`, `CF_PAGES_BRANCH`,
> `CF_PAGES_URL` into the build environment. Reference them in your
> own env vars with `${VAR}` interpolation in the dashboard.

For preview deploys (any branch other than `main`), set the same
variables under the **Preview** environment — they should be
identical except possibly stripping the version (preview = dev).

## D. (Optional) GitHub Actions ↔ Cloudflare integration

The repo's existing CI (`.github/workflows/ci.yml`) already runs
`lint → typecheck → test → build → privacy-audit` on every push and
PR. With Step A done, Cloudflare runs its own build separately — that
duplicates work. Two ways to keep them aligned:

1. **Leave both running.** GitHub Actions is the authoritative gate
   (blocks PR merges); Cloudflare is the deploy. Slightly redundant
   but safest.
2. **Use the `cloudflare/wrangler-action`** to deploy from CI after
   the gates pass:

   ```yaml
   - name: Deploy to Cloudflare Pages
     if: github.ref == 'refs/heads/main'
     uses: cloudflare/wrangler-action@v3
     with:
       apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
       accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
       command: pages deploy out --project-name=timechaingrid --branch=main
   ```

   This requires GitHub repository secrets `CLOUDFLARE_API_TOKEN`
   and `CLOUDFLARE_ACCOUNT_ID`. The token needs `Account.Cloudflare
   Pages: Edit` permission scoped to this account only. Then disable
   Cloudflare's automatic Git deploys in the Pages project settings
   so only CI deploys.

   Recommend (2) eventually; (1) is fine for now.

## E. (Phase C+ prerequisite) R2 bucket for parquet data

When the chain-tools pipeline starts publishing real wallet/activity
data, the viewer fetches from a CDN bucket we own. Cloudflare R2 fits
the privacy posture (no third-party CDN).

1. **R2** → **Create bucket** → name `timechain-data`.
2. Bucket → **Settings** → **Public access** → enable for `r2.dev`
   subdomain (or attach a custom domain like `data.timechaingrid.com`).
3. **CORS policy** — allow only the two production origins:

   ```json
   [
     {
       "AllowedOrigins": [
         "https://timechaingrid.com",
         "https://timechaingraph.com"
       ],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. Update both repos' `BitcoinChainAdapter` constructor call sites
   to use the bucket URL as `cdnBase`. Until then, the adapter is
   stubbed; the visible cost is zero.

## F. Privacy audit on production

After every deploy, sanity-check that no third-party domain leaked in:

```bash
curl -s https://timechaingrid.com | grep -E 'googleapis|gstatic|googletagmanager|jsdelivr|unpkg' || echo "clean"
```

The CI's `privacy-audit.sh` already runs this against `out/` before
deploy, but a post-deploy check guards against any in-flight or
edge-script injection.

## Decisions deferred to you

- **Tor onion service** for v0.3 (project plan). Cloudflare Pages
  doesn't natively serve over Tor; a parallel Onion Hosting setup
  via OnionShare or a dedicated Tor relay is needed. Defer until
  v0.3 when the Cluster Lattice ships.
- **`www.` redirect.** Whether to canonicalize on apex (recommended
  for SEO) or keep `www` separate.
- **Wildcard certificate** for `*.timechaingrid.com`. Useful if a
  staging subdomain (e.g., `staging.timechaingrid.com`) is wanted.
  Cloudflare Pages issues per-domain certs by default.

## Verification checklist

- [ ] `https://timechaingrid.com/` returns 200 and renders the
      umbrella landing
- [ ] `/grid/` shows the interactive lattice with 50 wallets
- [ ] DevTools Network tab during a full page load shows zero
      requests to non-Cloudflare/non-`timechaingrid.com` domains
- [ ] Footer reads `v0.0.1 · <commit-sha>` (not `v0.0.1 · dev`)
- [ ] CI deploy preview URL works for any feature branch
- [ ] Lighthouse scores: ≥ 90 perf, ≥ 95 a11y, ≥ 95 best-practices

When all six pass, the domain is wired correctly.
