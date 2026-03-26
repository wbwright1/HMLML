"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";

const NAV_LINKS = [
  { label: "Hub", href: "/" },
  { label: "Teams", href: "/teams" },
  { label: "Records", href: "/records" },
  { label: "History", href: "/seasons" },
  { label: "Drafts", href: "/drafts" },
  { label: "Players", href: "/players" },
] as const;

function isLinkActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface SiteNavClientProps {
  pillBadge?: ReactNode;
}

export function SiteNavClient({ pillBadge }: SiteNavClientProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Close overlay on Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeMenu();
        hamburgerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeMenu]);

  // Close overlay on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        overlayRef.current &&
        !overlayRef.current.contains(target) &&
        hamburgerRef.current &&
        !hamburgerRef.current.contains(target)
      ) {
        closeMenu();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen, closeMenu]);

  // Focus trap within overlay
  useEffect(() => {
    if (!isOpen || !overlayRef.current) return;

    const focusableLinks = overlayRef.current.querySelectorAll<HTMLElement>("a");
    if (focusableLinks.length === 0) return;

    // Focus first link on open
    focusableLinks[0].focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (!focusableLinks || focusableLinks.length === 0) return;

      const firstLink = focusableLinks[0];
      const lastLink = focusableLinks[focusableLinks.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstLink) {
          e.preventDefault();
          lastLink.focus();
        }
      } else {
        if (document.activeElement === lastLink) {
          e.preventDefault();
          firstLink.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Close menu on navigation (pathname change)
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Desktop nav links */}
      <ul className="hidden md:flex items-center gap-6" role="list">
        {NAV_LINKS.map(({ label, href }) => {
          const active = isLinkActive(href, pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
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

      {/* Right side: pill badge + hamburger button (mobile) */}
      <div className="flex items-center gap-3">
        {pillBadge}

        {/* Hamburger button (mobile only) */}
        <button
          ref={hamburgerRef}
          type="button"
          className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={isOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isOpen ? "true" : "false"}
          aria-controls="mobile-nav-menu"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {isOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile nav overlay */}
      {isOpen && (
        <div
          ref={overlayRef}
          id="mobile-nav-menu"
          className="fixed top-14 inset-x-0 z-30 bg-background border-b border-border md:hidden"
        >
          <ul role="list">
            {NAV_LINKS.map(({ label, href }) => {
              const active = isLinkActive(href, pathname);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "block py-3 px-6 text-base font-medium text-primary border-l-2 border-primary pl-5"
                        : "block py-3 px-6 text-base font-medium text-foreground hover:bg-muted transition-colors"
                    }
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
