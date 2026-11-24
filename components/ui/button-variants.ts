import { cva } from "class-variance-authority";

/**
 * Button system (UI/UX pass, 2026-11-24; mirrors the Cardhouse kit):
 * - `default` is the primary: gold fill, the ONLY in-page button with a
 *   shadow, at most one per screen. Pressing scales to 97% and tucks the
 *   shadow in.
 * - `outline` is the secondary: transparent with a 3:1 control edge.
 * - `quiet` is a text action (gold text, tint on hover), for "View all",
 *   "Undo", "Retry" style links inside rows and toasts.
 * - Sizes: `lg` 48 (hero action), `default` 44 (everything else), `sm` 36
 *   (header and dense rows only, inside a 44px hit area). Nothing smaller.
 */
export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding font-semibold whitespace-nowrap outline-none select-none transition-[scale,box-shadow,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-primary)] hover:brightness-105 active:shadow-[var(--shadow-primary-pressed)] disabled:shadow-none",
        outline:
          "border-border-control bg-transparent text-text-primary hover:bg-surface-muted aria-expanded:bg-surface-muted aria-expanded:text-text-primary",
        secondary:
          "border-border-control bg-transparent text-text-primary hover:bg-surface-muted aria-expanded:bg-surface-muted aria-expanded:text-secondary-foreground",
        quiet:
          "bg-transparent text-accent-gold hover:bg-accent-gold-light",
        ghost:
          "text-text-primary hover:bg-surface hover:text-text-primary aria-expanded:bg-surface aria-expanded:text-text-primary",
        destructive:
          "bg-destructive text-primary-foreground hover:brightness-110 focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-5 text-[15px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-9 gap-1.5 px-3.5 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        sm: "h-9 gap-1.5 px-3.5 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 gap-2 px-6 text-[15px] has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-11",
        "icon-xs": "size-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
