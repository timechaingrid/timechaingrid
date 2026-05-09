# Contributing to Timechain Grid

Thank you for your interest in contributing. This document describes the
contributor workflow, the local development setup, and the standards a
patch needs to clear before it can be merged.

## Code of Conduct

Participation is governed by the project's
[Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree to abide
by its terms.

## Reporting bugs

Open a [GitHub issue](../../issues) using the bug template. Include:

- A clear description of the unexpected behavior
- Reproduction steps (or a minimal failing example)
- The commit hash or release tag you tested against
- Browser + OS + device details for viewer regressions

For **security issues**, do not open a public issue — see
[SECURITY.md](SECURITY.md).

## Suggesting features

Open an issue using the feature template. Briefly describe:

- The user story (who, what, why)
- The expected user-facing behavior
- Any privacy or performance implications
- Whether this is in scope for the current
  [roadmap](README.md#roadmap)

Major features typically benefit from a design sketch in the issue before
a PR lands.

## Local development

### Prerequisites

- Node.js 20+ (LTS)
- npm (the project ships a `package-lock.json`; reproducible builds
  depend on using npm rather than yarn/pnpm)

### Setup

```bash
git clone <fork-url>
cd timechaingrid
npm install
npm run dev               # http://localhost:3000
```

### Validation gates

Every commit must keep these green:

```bash
npm run typecheck         # tsc --noEmit, strict mode
npm run test:run          # Vitest suite
npm run lint              # ESLint
npm run build             # full production build
npm run privacy-audit     # forbidden-domain scan over out/
```

CI runs all of the above. A pull request that breaks any of them won't
merge until it's green.

## Pull-request workflow

1. Fork the repository on GitHub.
2. Create a feature branch off `main`. Use a descriptive name:
   `fix/scrubber-edge-case`, `feat/halving-quickjumps`,
   `docs/contributing-clarify`.
3. Make your changes in small, focused commits. Each commit should leave
   the project in a working state (CI green).
4. Update tests so the change is covered. New behavior without a test is
   a non-starter.
5. Update `CHANGELOG.md` under `[Unreleased]` if your change is
   user-visible.
6. Run all validation gates locally.
7. Open a PR against `main`. Fill in the PR template — what changed,
   why, how it was tested, screenshots/recordings for UI changes.
8. Address review feedback in additional commits (don't force-push
   until the PR is approved; we squash on merge).

## Commit message style

```
<type>(<scope>): <short summary>

<optional body — what changed and why>

<optional trailer — fixes #123, references #456>
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`,
`build`, `ci`. Scope is a short module hint (`grid`, `vault`, `home`,
`docs`, etc.).

Examples:

```
feat(grid): show approximate chain date in the BlockNarrative HUD
fix(scrubber): clamp value when latestBlock advances mid-drag
docs(readme): clarify the privacy-audit gate
```

## Privacy guarantees

This is the project's strongest invariant. Any patch that introduces a
new third-party network call from the viewer at runtime will be rejected.
The privacy-audit script enforces this against the static export, but
reviewers also watch for:

- New runtime dependencies that fetch from external CDNs
- Service workers that fall through to off-list domains
- Build-time injection of third-party scripts (analytics, fonts, ads,
  hosted SDKs)
- Inline `<script src="https://…">` tags

If your change needs an external resource, propose vendoring it locally
or running it through a self-hosted proxy on infrastructure the project
controls.

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](LICENSE) that covers the rest of the project.
