# Story 1.19: Responsive Layout Shell

## Story
As a visitor on any device,
I want the site to adapt gracefully to my screen size,
So that the experience is optimal regardless of device.

## Acceptance Criteria

**Given** the site loads on mobile (< 768px)
**Then** single-column layout with 16px horizontal padding and full-bleed cards
**Given** the site loads on tablet (768px - 1023px)
**Then** gentle scaling, nav expands, content begins centering
**Given** the site loads on desktop (>= 1024px)
**Then** max-width 1200px centered, generous whitespace (96px top/bottom, 48px between sections)
**And** no horizontal scrolling occurs at any breakpoint

## Notes
- UX-DR39: Mobile-first responsive spec
- FR35: Mobile, tablet, desktop responsive
