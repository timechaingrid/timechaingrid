import type { ReactNode } from 'react';
import { NavBar } from '@/components/NavBar';

/**
 * Grid (kiosk) layout — escapes the document-style chrome to give
 * the lattice the full viewport. The NavBar still renders at the
 * top so the user can navigate away, but nothing else (no centered
 * max-width, no SiteFooter, no scrollable document content). The
 * page renders as a fixed full-screen canvas with floating HUD
 * panels overlaid.
 *
 * Body scroll is disabled by `overflow-hidden` on this wrapper +
 * `h-dvh` viewport-locking — `/grid` becomes a "place" you visit
 * rather than a "document" you scroll, matching the user's
 * directive 2026-04-30: "the grid page should only contain a full
 * screen grid view, no scrollable page".
 */
export default function GridLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[color:var(--color-background)]">
      <div className="px-6 pt-4 md:px-10">
        <NavBar />
      </div>
      <div className="relative flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
