# Security Policy

Timechain Grid is a privacy-first Bitcoin viewer. Its strongest invariant is
that the static viewer at `timechaingrid.com` makes **no third-party network
calls at runtime** — every request resolves to a domain the project operates.
A vulnerability that breaks this invariant is treated as high-severity.

## Reporting a vulnerability

Please report privately. **Do not open a public issue** for security matters
— that gives bad actors a window before a fix lands.

| Channel | Use it for |
|---|---|
| GitHub Security Advisory | Preferred. Encrypted, threaded, ships with built-in coordinated-disclosure tooling. Open one from the repo's Security tab. |
| Email · `security@timechaingrid.com` | Fallback for issues you'd rather not file through GitHub. PGP key forthcoming. |

Include: a clear description, reproduction steps, the commit hash you tested
against, and (if applicable) a proof-of-concept or trace. We won't ask for
your real name or affiliation.

## Response timeline

| Stage | Target |
|---|---|
| Acknowledge receipt | within 72 hours |
| Triage + initial assessment | within 1 week |
| Fix + coordinated disclosure | within 30 days for high-severity, 90 days for moderate |

If you don't hear back within the acknowledgement window, ping the same
channel — your message may have hit a filter.

## In scope

- Any **third-party network call** originating from the viewer at runtime.
  This is the privacy claim's strongest invariant. The CI privacy-audit
  (`scripts/privacy-audit.sh`) checks the static export against a forbidden-
  domain list; bypass paths (string-built URLs, dynamic env injection,
  service workers fetching off-list domains) are in scope.
- **Identity-leaking dependencies** that slip past the privacy-audit.
- **Build-pipeline integrity**: CI tampering, dependency confusion,
  malicious npm packages, GitHub Action escalation, lockfile drift that
  introduces network-calling code.
- **Secret leakage** in the public repo or static export.
- **Cross-site scripting** in the rendered viewer.
- **Subresource integrity gaps** for the local-bundled assets.
- **Static export footprint** that exposes operator infrastructure
  (bitcoind/electrs hostnames, internal R2 keys, etc.).

## Out of scope

- The Bitcoin protocol itself — report to https://bitcoincore.org/.
- Third-party Lightning wallets used by donors — report to wallet vendors.
- Self-hosted infrastructure run by the operator (bitcoind, electrs, R2,
  BTCPay) — out of repo scope; coordinate directly with the operator.
- The developer API at `api.timechaingrid.com` (separate scope, ships v0.4
  — when it launches, this section will narrow).
- The subscriptions surface (planned at `insights.timechaingrid.com`),
  which is a separate deployment and will have its own security policy.

## No bug bounty (yet)

We don't currently offer monetary bounties. Once revenue stabilizes via
Lightning donations, GitHub Sponsors, OpenSats grant, and the planned
subscription tier, this section will be revisited. For now, public credit
in `CHANGELOG.md` and a thank-you in the next release notes is the
recognition we can offer — opt-in, of course.

## Disclosure history

No disclosed vulnerabilities yet. This section will be populated as
incidents arise; it'll list each fixed issue with severity, fix commit,
and reporter (with their consent).
