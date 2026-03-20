---
stepsCompleted: [1, 2, 3]
inputDocuments: ['prd.md', 'architecture.md']
---

# UX Design Specification FantasyWebsite

**Author:** Blake
**Date:** 2026-03-17

---

<!-- UX design content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

### Project Vision

The Harambe Memorial League Website transforms a 12-team dynasty fantasy football league from scattered Sleeper app data and group chat memories into a permanent, always-available institution with history, personality, and trash-talk fuel. The site is fully public (no login), server-rendered, and mobile-first — designed for quick weekly check-ins and deep historical dives alike. All data is automatically synced from the Sleeper API, with near-live matchup scores during NFL game windows. The site preserves and unifies history across the league's legacy 10-team era and current 12-team format.

### Target Users

1. **The Casual Member** — Visits weekly on mobile, wants rivalry stats and trash-talk ammunition fast. Values glanceable, shareable content.
2. **The Stats Nerd** — Deep-dives into draft history, career legacy stats, and all-time leaderboards. Wants proof and receipts across all seasons including the legacy era.
3. **The Commish** — Manages the league record. Will publish weekly recaps in Phase 2. Needs the site to be the authoritative source of truth.
4. **The New Manager** — Just joined, needs to get oriented on their franchise's history, the league landscape, and who the competition is — without asking anyone.
5. **The Dynasty Manager** — Checks player ownership and status for trade intel. Quick in-and-out visits, often on mobile.

### Key Design Challenges

1. **Data-dense tables on mobile** — Standings, leaderboards, draft boards, and head-to-head records are inherently tabular. The UX must make these scannable on phones without relying on constant horizontal scrolling.
2. **Legacy/current era continuity** — The site spans two league eras (10-team → 12-team). Franchise history, draft records, and career stats must flow seamlessly across eras without confusing the user about which era they're viewing.
3. **Live vs. static content blending** — The matchup page introduces near-live polling into an otherwise static, server-rendered site. The experience must feel cohesive, not like two different products.
4. **Color-blind accessibility** — A league member cannot distinguish reds and purples. All color-coded UI (win/loss, rankings, status) must include secondary indicators (labels, icons, patterns). Red/purple pairings are prohibited as primary data signals.

### Design Opportunities

1. **Trash-talk fuel by design** — Shareable URLs, screenshot-friendly layouts, and provocative stat surfacing (rivalry streaks, head-to-head dominance) drive organic engagement through group chat sharing.
2. **Franchise identity as anchor** — Persistent franchise pages with year-over-year ownership, trophies, and records create institutional weight that no fantasy platform provides natively.
3. **Glanceable surface, explorable depth** — Most visits are quick (check scores, grab a stat). The same data should reward deeper exploration. A progressive-depth pattern serves all five user types without overwhelming casual visitors or boring power users.

## Core User Experience

### Defining Experience

The HML Website serves two complementary core loops driven by the NFL calendar:

- **In-season (Sep–Jan):** Arrive → find a stat, rivalry record, or matchup result → screenshot → fire it into the group chat. The site is a trash-talk weapon. Speed-to-stat is everything.
- **Offseason (Feb–Aug):** Browse franchise histories, draft records, and career stats with a sense of nostalgia and institutional pride. The site is a living archive that rewards leisurely exploration of "remember when" moments.

The core user action across both modes is the same: **find a specific historical fact and either share it or savor it.** Every design decision should minimize the distance between "I wonder..." and "here it is."

### Platform Strategy

- **Mobile-first web application** — the majority of visits will be phone-based (checking scores at lunch, screenshotting stats for group chat sharing, quick player lookups)
- **Desktop as secondary but valued** — deep dives into draft history, full season timelines, and multi-franchise comparisons are better on larger screens
- **No native app, no offline** — a responsive web app with shareable URLs is the right tool for a 12-person audience
- **Touch-optimized** — tap targets, swipeable content where appropriate, no hover-dependent interactions

### Effortless Interactions

- **Viewing history and matchup results** — browsing any season's results, any franchise's record, any week's matchups must feel instant and require minimal navigation
- **Finding superlatives** — "who's the best/worst franchise in league history?" should be answerable at a glance from leaderboards and career stats
- **Sharing** — every meaningful view has a clean, shareable URL; layouts should look good when screenshotted on mobile
- **Orientation** — a new manager landing on the site should understand the league landscape without guidance; the information architecture should be self-explanatory

### Critical Success Moments

1. **The superlative discovery** — a member visits, finds proof that a franchise is definitively the best or worst at something historically, and shares it. This is the moment the site becomes indispensable.
2. **The rivalry receipt** — pulling up an H2H record that settles a group chat argument. The site becomes the authoritative source.
3. **The nostalgia scroll** — browsing old seasons and draft picks during the offseason, remembering trades and busts. The site becomes the league's collective memory.
4. **The new manager "aha"** — a new owner explores their franchise page and understands its full history without asking anyone. The site earns trust.

### Experience Principles

1. **Speed-to-stat** — every design choice should minimize the number of taps/clicks between a question and its answer. If a user has to think about where to find something, we've failed.
2. **Superlatives on the surface** — best, worst, most, least, longest streak — these should be visible and prominent, not buried in raw data tables. The site should tell stories, not just display numbers.
3. **Screenshot-worthy** — layouts should be designed with the assumption that they'll be screenshotted and dropped into a group chat. Clean, legible, with enough context to stand alone.
4. **Two modes, one site** — the same content serves both in-season trash talk and offseason nostalgia. The design should feel energetic during game windows (live scores) and warm/archival when browsing history.
