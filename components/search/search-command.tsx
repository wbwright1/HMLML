"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  SearchResults,
  flattenOptions,
  type SearchData,
} from "./search-results";

type Variant = "desktop" | "mobile";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

const EMPTY: SearchData = { franchises: [], players: [] };

interface SearchCommandProps {
  variant: Variant;
  className?: string;
}

/**
 * Site-wide search. One component, two presentations:
 * - "desktop": inline topbar field + popover listbox (⌘K / focus opens).
 * - "mobile": dock trigger bar that opens a full-screen sheet.
 * ARIA combobox pattern; keyboard + pointer stay in sync via a flat option list.
 */
export function SearchCommand({ variant, className = "" }: SearchCommandProps) {
  const router = useRouter();
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchData | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const options = data ? flattenOptions(data) : [];
  const activeId =
    activeIndex >= 0 && activeIndex < options.length
      ? options[activeIndex].id
      : null;
  const trimmed = query.trim();
  const hasQuery = trimmed.length >= MIN_CHARS;

  // Debounced fetch with stale-request abort.
  useEffect(() => {
    if (!open || !hasQuery) {
      setData(null);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setData(EMPTY);
          setActiveIndex(-1);
          return;
        }
        const json = (await res.json()) as { data: SearchData };
        setData(json.data ?? EMPTY);
        setActiveIndex(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setData(EMPTY);
          setActiveIndex(-1);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, hasQuery, trimmed]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    if (variant === "desktop") {
      inputRef.current?.blur();
    } else {
      setQuery("");
      setData(null);
      triggerRef.current?.focus();
    }
  }, [variant]);

  const navigate = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  const handleKeyNav = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (options.length === 0) return;
        setActiveIndex((i) => (i + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (options.length === 0) return;
        setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && options[activeIndex]) {
          e.preventDefault();
          navigate(options[activeIndex].href);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    },
    [options, activeIndex, navigate, close]
  );

  const onHover = useCallback(
    (id: string) => {
      const idx = options.findIndex((o) => o.id === id);
      if (idx >= 0) setActiveIndex(idx);
    },
    [options]
  );

  // ── Desktop: global ⌘K / Ctrl+K, click-outside close ──────────────────────
  useEffect(() => {
    if (variant !== "desktop") return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant]);

  useEffect(() => {
    if (variant !== "desktop" || !open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [variant, open]);

  // ── Mobile: autofocus, body scroll-lock, focus trap ───────────────────────
  useEffect(() => {
    if (variant !== "mobile" || !open) return;
    inputRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [variant, open]);

  useEffect(() => {
    if (variant !== "mobile" || !open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        dialog!.querySelectorAll<HTMLElement>(
          'a[href], button, input, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, [variant, open, data]);

  const inputAria = {
    role: "combobox" as const,
    "aria-expanded": open && !!data,
    "aria-controls": listboxId,
    "aria-activedescendant": activeId ?? undefined,
    "aria-autocomplete": "list" as const,
    "aria-label": "Search league",
  };

  // ── Desktop presentation ──────────────────────────────────────────────────
  if (variant === "desktop") {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-[17px] -translate-y-1/2 text-text-tertiary"
            strokeWidth={1.7}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search…"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyNav}
            {...inputAria}
            className="h-9 w-[150px] rounded-[10px] border border-border bg-surface pl-9 pr-12 text-body-sm text-text-primary outline-none placeholder:text-text-tertiary focus-visible:border-border-strong xl:w-[230px]"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[5px] border border-border px-1.5 py-0.5 text-[9.5px] font-bold text-text-tertiary">
            ⌘K
          </kbd>
        </div>
        {open && data && (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Search results"
            className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] w-[360px] overflow-y-auto rounded-[14px] border border-border bg-popover shadow-[0_24px_60px_rgba(0,0,0,.4)]"
          >
            <SearchResults
              data={data}
              activeId={activeId}
              onSelect={close}
              onHover={onHover}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Mobile presentation ───────────────────────────────────────────────────
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Search teams, players, records"
        className={`flex w-full items-center gap-2.5 rounded-[14px] border border-border bg-surface px-3.5 py-3 text-left ${className}`}
      >
        <Search
          className="size-5 shrink-0 text-text-tertiary"
          strokeWidth={1.7}
          aria-hidden="true"
        />
        <span className="flex-1 truncate text-body-sm text-text-tertiary">
          Search teams, players, records…
        </span>
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-[60] flex flex-col bg-canvas"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="flex items-center gap-2 border-b border-border p-3">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-text-tertiary"
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                placeholder="Search teams, players, records…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyNav}
                {...inputAria}
                className="h-11 w-full rounded-[10px] border border-border bg-surface pl-10 pr-3 text-body text-text-primary outline-none placeholder:text-text-tertiary focus-visible:border-border-strong"
              />
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-text-tertiary"
            >
              <X className="size-5" strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>
          <div
            id={listboxId}
            role="listbox"
            aria-label="Search results"
            className="flex-1 overflow-y-auto"
          >
            {data ? (
              <SearchResults
                data={data}
                activeId={activeId}
                onSelect={close}
                onHover={onHover}
              />
            ) : (
              <p className="px-4 py-6 text-center text-body-sm text-text-tertiary">
                {hasQuery
                  ? "Searching…"
                  : "Type to search teams, players, and records."}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
