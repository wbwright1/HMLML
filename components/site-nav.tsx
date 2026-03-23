"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { label: "Matchups", href: "/matchups" },
  { label: "Teams", href: "/teams" },
  { label: "Records", href: "/records" },
  { label: "Drafts", href: "/drafts" },
  { label: "History", href: "/seasons" },
  { label: "Players", href: "/players" },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden md:block border-b border-border bg-background/95 backdrop-blur-sm">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 lg:px-8 h-14"
      >
        <Link href="/" className="text-lg font-bold text-primary">
          HMLML
        </Link>

        <ul className="flex items-center gap-6">
          {links.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "text-sm font-medium text-primary underline underline-offset-4 decoration-primary"
                      : "text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  }
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
