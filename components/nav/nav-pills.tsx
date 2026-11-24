"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, BarChart3, ListOrdered, BookOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  /** Dock labels are 12px in a fifth of the screen; "The Book" does not fit. */
  dockLabel?: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Five items, on desktop and on the dock. The Book took the Players slot
 * (Blake's call): a sixth pill crowds the topbar and a sixth dock icon is
 * thumb-hostile, and the sportsbook is a weekly destination while /players is
 * something you reach for by name. /players stays fully live and is reachable
 * from search (its primary door), the footer, every PlayerLink on the site, and
 * the "All players" entry on roster pages.
 */
const NAV_ITEMS: NavItem[] = [
  { label: "Hub", href: "/", icon: Home },
  { label: "Teams", href: "/teams", icon: Users },
  { label: "Records", href: "/records", icon: BarChart3 },
  // A list (draft order), not a trophy: the trophy reads as "champions".
  { label: "Drafts", href: "/drafts", icon: ListOrdered },
  { label: "The Book", dockLabel: "Book", href: "/book", icon: BookOpen },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

interface NavPillsProps {
  /** "topbar" = horizontal accent-tint pills; "dock" = icon + label tab bar. */
  variant: "topbar" | "dock";
}

export function NavPills({ variant }: NavPillsProps) {
  const pathname = usePathname();

  if (variant === "topbar") {
    return (
      <ul className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
        {NAV_ITEMS.map(({ label, href }) => {
          const active = isActive(href, pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas xl:px-4 ${
                  active
                    ? "bg-accent-gold-light text-accent-gold"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="flex items-stretch gap-0.5">
      {NAV_ITEMS.map(({ label, dockLabel, href, icon: Icon }) => {
        const active = isActive(href, pathname);
        return (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={dockLabel ? label : undefined}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[12px] py-1.5 transition-[scale] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active ? "bg-accent-gold-light" : ""
              }`}
            >
              <Icon
                className={`size-[22px] ${
                  active ? "text-accent-gold" : "text-text-secondary"
                }`}
                strokeWidth={2}
                aria-hidden="true"
              />
              <span
                className={`text-caption font-medium ${
                  active ? "text-accent-gold" : "text-text-secondary"
                }`}
              >
                {dockLabel ?? label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
