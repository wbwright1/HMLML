import { NavPills } from "@/components/nav/nav-pills";

/**
 * Mobile chrome (<lg): fixed thumb-reach dock — tab-bar only (search moved to
 * the mobile header as an icon trigger, see mobile-header.tsx). Height ≈ 80px
 * + safe-area; layout.tsx & site-footer clear this on mobile. Positioning
 * (fixed/z-index) lives on the ScrollChrome wrapper in site-nav.tsx, not here.
 */
export function MobileDock() {
  return (
    <div
      className="border-t border-border bg-canvas/90 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-3 pt-3">
        <nav aria-label="Mobile navigation">
          <div className="rounded-[18px] border border-border bg-surface p-1.5 shadow-[0_6px_20px_rgba(0,0,0,.3)]">
            <NavPills variant="dock" />
          </div>
        </nav>
      </div>
    </div>
  );
}
