import type { ReactNode, ElementType } from "react";

interface VisuallyHiddenProps {
  children: ReactNode;
  as?: ElementType;
}

/**
 * Renders content that is visually hidden but remains accessible
 * to screen readers and other assistive technologies.
 *
 * @example
 * <button>
 *   <MenuIcon />
 *   <VisuallyHidden>Menu</VisuallyHidden>
 * </button>
 */
export function VisuallyHidden({ children, as: Tag = "span" }: VisuallyHiddenProps) {
  return <Tag className="sr-only">{children}</Tag>;
}
