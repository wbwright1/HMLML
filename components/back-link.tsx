import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface BackLinkProps {
  href: string;
  label: string;
}

/**
 * Site-wide back navigation link: a ChevronLeft icon plus a label, with a
 * 44px hit area. Server component (no interactivity); the icon is decorative
 * and hidden from assistive tech since the label already carries the
 * destination.
 */
export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1 rounded-md pr-2 text-body-sm text-text-tertiary hover:text-text-primary transition-[color,scale] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
      {label}
    </Link>
  );
}
