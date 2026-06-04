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
