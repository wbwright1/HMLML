import Link from "next/link";

interface BackLinkProps {
  href: string;
  label: string;
}

/**
 * Site-wide back navigation link: a left-arrow glyph plus a label. Server
 * component (no interactivity); the arrow is decorative and hidden from
 * assistive tech since the label already carries the destination.
 */
export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-body-sm text-text-tertiary hover:text-text-primary transition-colors"
    >
      <span aria-hidden>&larr;</span>
      {label}
    </Link>
  );
}
