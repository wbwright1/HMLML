import Link from "next/link";
import { LivePill, type LivePillProps } from "@/components/live-pill";

interface MobileHeaderProps {
  livePill: LivePillProps;
}

/** Mobile chrome (<lg): sticky 56px header with wordmark + compact live pill. */
export function MobileHeader({ livePill }: MobileHeaderProps) {
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-canvas/85 px-4 backdrop-blur-md lg:hidden">
      <Link
        href="/"
        aria-label="HMLML, Home"
        className="font-serif text-[21px] italic text-accent-gold"
      >
        HMLML
      </Link>
      <LivePill {...livePill} format="compact" />
    </div>
  );
}
