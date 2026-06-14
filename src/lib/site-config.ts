/**
 * Site-config — the only file that should differ between the Grid and Graph
 * repos in their shared layer (NavBar, SiteFooter, page.tsx, layout).
 *
 * Each companion project declares its own VIEW + companion-view pointer here;
 * everything downstream reads from these constants so the components remain
 * byte-identical between the two repos. To keep the repos in sync,
 * components and pages are copied 1:1 — only this file diverges.
 */

export type ViewId = 'grid' | 'graph';

export const VIEW: ViewId = 'grid';

export const VIEW_BRAND = 'GRID';
export const VIEW_DOMAIN = 'timechaingrid.com';
export const VIEW_TAGLINE = "Bitcoin's digital real estate";
export const VIEW_ACCENT = 'gold' as const;

/** Proper-case brand for prose ("Timechain Grid"). Diverges Graph/Grid. */
export const VIEW_BRAND_NAME = 'Grid';

export const VIEW_HERO_TOP = 'Timechain Grid';
export const VIEW_HERO_BOTTOM = 'of Bitcoin.';
export const VIEW_HERO_DESCRIPTION =
  '“Timechain” was Satoshi’s name for the blockchain — a chain of timestamped blocks. Here it is, the fixed map it always was: every coin a tile, every block a ring from Satoshi, the ledger legible in your browser. Public to watch, private to use.';

export const OTHER_VIEW_BRAND = 'GRAPH';
export const OTHER_VIEW_DOMAIN = 'timechaingraph.com';
export const OTHER_VIEW_TAGLINE = 'a force-directed living network view of Bitcoin';
export const OTHER_VIEW_ACCENT = 'gold' as const;
export const OTHER_VIEW_URL = `https://${OTHER_VIEW_DOMAIN}`;

/**
 * Whether shared components (NavBar, SiteFooter, landing-page-section
 * components) should surface cross-view callouts beyond the single
 * "{OTHER_VIEW_BRAND} View" button in the NavBar. Set to false here
 * so the Grid landing page stays self-contained — the topbar button
 * is the single canonical entry point to the other view.
 */
export const SHOW_OTHER_VIEW_CALLOUTS = false;

/**
 * Project-wide slogan. Same on both sibling sites and on the future
 * game build. A single, short brand line. Aligned with companion's naming.
 */
export const BRAND_TAGLINE = 'Bitcoin Visualised';

export const SITE_URL = `https://${VIEW_DOMAIN}`;

// Developer API endpoint for THIS view. Derived from VIEW_DOMAIN so the
// byte-identical privacy/page.tsx (and future NavBar API link) renders the
// right domain on Grid and Graph without diverging from the shared file.
// v0.4 milestone — the subdomain isn't live yet.
export const API_DOMAIN = `api.${VIEW_DOMAIN}`;
export const API_URL = `https://${API_DOMAIN}`;

export const SITE_TITLE = `Timechain ${VIEW_BRAND}`;
export const SITE_TITLE_FULL = `${BRAND_TAGLINE} — Timechain ${VIEW_BRAND}`;
export const SITE_DESCRIPTION =
  "Bitcoin's digital real estate, block by block. Every coin a tile, every block opens new tiles. Satoshi at the origin. Public, privacy-first, no third-party scripts.";

/**
 * Donation rails — Bitcoin-native, self-custodial (see /donate). Operator
 * decision (2026-06-05): Grid intentionally SHARES Graph's receive address —
 * one Sparrow wallet collects for both sites. Verified P2WPKH (bitcoind
 * validateaddress: isvalid). public/donate-btc-qr.svg encodes bitcoin:<addr>
 * (same QR as Graph, decode-verified).
 */
export const DONATION_BTC_ADDRESS = 'bc1q2hhsxyuzj4e6wcjegayddjphdry02wdef9v62l';
export const DONATION_LIGHTNING_ADDRESS = ''; // coming: self-hosted via BTCPay/LNbits
export const DONATION_LIVE =
  DONATION_BTC_ADDRESS.length > 0 && !DONATION_BTC_ADDRESS.includes('PLACEHOLDER');

/**
 * Contact + social. Per-site support mailbox (operator provisions it). Social
 * handles are EMPTY until the accounts exist — each footer link renders only
 * when its handle is set, so going live is a one-line edit here (no code change,
 * mirrors the Graph sibling's gating). These MUST diverge between Graph and Grid.
 * Typed `: string` so the "is it set?" conditionals aren't constant-folded.
 */
export const SUPPORT_EMAIL: string = 'support@timechaingrid.com';
export const X_HANDLE: string = 'timechaingrid'; // x.com/timechaingrid (no @)
export const NOSTR_NPUB: string = 'npub12ynwkvuxjxv5qjqpzn3gsrvvfaydafjwfhsved2y6du6u3462pgs6sp0au'; // SHARED with Graph by design (operator decision 2026-06-14): Timechain Graph is the flagship Nostr identity, so Grid's footer icon links to the SAME npub (njump.me/<npub>). The one intentional exception to "these MUST diverge". No /.well-known/nostr.json needed on Grid — NIP-05 verification lives at @timechaingraph.com, where the account claims to live.
export const GITHUB_URL: string = 'https://github.com/timechaingrid/timechaingrid'; // set once repo is public

export interface SocialLink {
  label: string;
  href: string;
  icon: 'mail' | 'github' | 'x' | 'nostr';
}
/** Configured socials only, in display order (mail → github → X → nostr). */
export const SOCIAL_LINKS: SocialLink[] = [
  ...(SUPPORT_EMAIL ? [{ label: 'Email', href: `mailto:${SUPPORT_EMAIL}`, icon: 'mail' as const }] : []),
  ...(GITHUB_URL ? [{ label: 'GitHub', href: GITHUB_URL, icon: 'github' as const }] : []),
  ...(X_HANDLE ? [{ label: 'X', href: `https://x.com/${X_HANDLE}`, icon: 'x' as const }] : []),
  ...(NOSTR_NPUB ? [{ label: 'Nostr', href: `https://njump.me/${NOSTR_NPUB}`, icon: 'nostr' as const }] : []),
];
