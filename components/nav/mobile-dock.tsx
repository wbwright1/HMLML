import { NavPills } from "@/components/nav/nav-pills";
import { SearchCommand } from "@/components/search/search-command";

/**
 * Mobile chrome (<lg): fixed thumb-reach dock — a persistent search bar sitting
 * directly above a 5-icon tab bar. Replaces the retired top nav / hamburger.
 * Height ≈ 132px + safe-area; layout.tsx & site-footer clear this on mobile.
 */
export function MobileDock() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-canvas/90 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-3 pt-3">
        <SearchCommand variant="mobile" />
        <nav aria-label="Mobile navigation" className="mt-2.5">
          <div className="rounded-[18px] border border-border bg-surface p-1.5 shadow-[0_6px_20px_rgba(0,0,0,.3)]">
            <NavPills variant="dock" />
          </div>
        </nav>
      </div>
    </div>
  );
}
