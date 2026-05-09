/**
 * Site-config — the only file that should differ between the Grid and Graph
 * repos in their shared layer (NavBar, SiteFooter, page.tsx, layout).
 *
 * Each sibling project declares its own VIEW + sister-domain pointer here;
 * everything downstream reads from these constants so the components remain
 * byte-identical between the two repos. To keep the repos in sync,
 * components and pages are copied 1:1 — only this file diverges.
 */

export type ViewId = 'grid' | 'graph';

export const VIEW: ViewId = 'grid';

export const VIEW_BRAND = 'GRID';
export const VIEW_DOMAIN = 'timechaingrid.com';
export const VIEW_TAGLINE = "Bitcoin's digital real estate";
export const VIEW_ACCENT = 'cyan' as const;

export const VIEW_HERO_TOP = 'Bitcoin,';
export const VIEW_HERO_BOTTOM = 'as real estate.';
export const VIEW_HERO_DESCRIPTION =
  'Every coin ever mined is a tile on an expanding 2D grid. Satoshi at the origin. Each block opens new real estate, swirling outward from the center. Hover any tile to see who owns it; watch the map grow block by block from genesis to today.';

export const SISTER_BRAND = 'GRAPH';
export const SISTER_DOMAIN = 'timechaingraph.com';
export const SISTER_TAGLINE = 'a force-directed Obsidian-style graph of Bitcoin';
export const SISTER_ACCENT = 'gold' as const;
export const SISTER_URL = `https://${SISTER_DOMAIN}`;

/**
 * Whether shared components (NavBar, SiteFooter, landing-page-section
 * components) should surface cross-domain callouts beyond the single
 * "View as {SISTER}" button in the NavBar. Per user directive
 * 2026-04-30: "should only exist in the topside bar button as view
 * as graph, only that button linking to graph should remain". Set
 * to false on the Grid side; sister can keep true if she wants.
 */
export const SHOW_SISTER_CALLOUTS = false;

/**
 * Project-wide slogan. Same on both sibling sites and on the future
 * game build. A single, short brand line. Aligned with sister's naming.
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
