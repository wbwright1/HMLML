---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments: []
workflowType: 'prd'
classification:
  projectType: web_app
  domain: sports_entertainment
  complexity: low-medium
  projectContext: greenfield
  platform: sleeper_api
  authModel: public_only_phase1
  scope: single_league
---

# Product Requirements Document - Harambe Memorial League Memorial League Website

**Author:** Blake
**Date:** 2026-03-13

## Executive Summary

The Harambe Memorial League Memorial League (HML) Website is a public-facing web application serving as the permanent home for the HML, a 12-team dynasty fantasy football league. It centralizes league history, performance data, draft records, and power rankings in one always-available destination — replacing scattered memories and buried Sleeper app data with a living record of the league's culture and lore.

All data is sourced and synced automatically from the Sleeper API via a 3-tier sync pipeline (daily, hourly, and near-live matchup scores every 30 seconds during active game windows). No login is required. The site carries forward history from the HML's predecessor (a 10-team league), ensuring the full dynasty timeline — including legacy seasons, rosters, and draft picks — is preserved and surfaced from day one.

### What Makes This Special

Most fantasy leagues exist only in the memory of their platform app. The HML Website turns a dynasty league into an institution — a place with history, personality, and trash-talk fuel that lives beyond any given season. Team-specific draft histories, head-to-head rivalry records, career legacy stats, and near-live scoring give the league a home that rewards both casual weekly check-ins and deep historical dives. The site's value compounds over time as history accumulates.

## Project Classification

- **Project Type:** Web Application (MPA, server-rendered)
- **Domain:** Sports & Entertainment (dynasty fantasy football)
- **Complexity:** Low-Medium (Sleeper API integration, legacy data import, 3-tier sync pipeline)
- **Project Context:** Greenfield
- **Data Source:** Sleeper API (3-tier sync); legacy league data via manual import
- **Auth Model:** Fully public — no login required (Phase 1); commish admin login added in Phase 2

## Success Criteria

### User Success

- League members visit the site at least once per week during the active season
- Members reference the site in group chats or conversations as a source of trash talk material
- The league history and trophy/rivalry pages are the most-visited sections
- Any league member can find a specific historical stat, record, or matchup result within seconds of arriving
- The site is the authoritative record of the HML — members trust it over their own memory

### Business Success

- All 12 managers have visited the site within the first month of launch
- The site is referenced in at least one league communication per week during the season
- Legacy league history (10-team era) is fully imported and accessible at launch
- Zero data gaps in Sleeper-synced data after go-live

### Technical Success

- All three sync jobs (daily, hourly, 30s poller) complete reliably without manual intervention
- Matchup scores reflect Sleeper data within 30 seconds during active game windows
- Transactions and roster data reflect Sleeper data within 60 minutes
- Legacy data imported cleanly with no missing seasons, rosters, or draft records

### Measurable Outcomes

- Weekly active visits from ≥6 of 12 managers during the season
- Site cited in group trash talk within 2 weeks of launch
- Full league history accessible from the founding season through current

## Product Scope

### Phase 1 — MVP

Entirely read-only and publicly accessible. No authentication complexity.

- **League history & season timeline** — all seasons including legacy 10-team era
- **Franchise pages** — persistent team identity with year-attributed ownership, season records, championship history
- **Trophy cases + head-to-head records & rivalries** — all-time awards, win/loss records, rivalry streaks
- **Draft history** — startup and rookie drafts by team and year, including legacy era
- **Power rankings & career legacy stats** — current and historical rankings, long-term franchise performance
- **All-time leaderboard & manager career stats** — wins, points scored, championships across all seasons
- **Near-live matchup scoring** — scores refresh every 30 seconds during active NFL game windows
- **Player search & status** — lookup by name, shows HML roster owner, NFL team, injury designation
- **Sync timestamp** — "Last updated" visible sitewide
- **3-tier Sleeper sync infrastructure** — daily / hourly / 30s game-window poller

### Phase 2 — Growth

- **Trade Center** — full trade history browser + trade block (hourly sync from Sleeper)
- **Weekly newsletters / auto-generated recaps** — commish-editable drafts generated from Sleeper data
- **Commish admin login** — required for newsletter publish workflow

### Phase 3 — Vision

- Self-service trade block management (members manage own listings)
- Outbound notifications (email digest, Discord webhook)

### Scope Risks

- *Legacy league chaining* — validate `previous_league_id` traversal works before building UI on top of it
- *Legacy data gaps* — audit all historical seasons pre-launch; any data pre-dating Sleeper requires manual entry
- *Game-window poller reliability* — degrade gracefully on Sleeper API errors; show last known scores with timestamp
- *Player search* — most droppable MVP feature if timeline is tight; users can fall back to the Sleeper app

## User Journeys

### Journey 1: The Casual League Member — Weekly Check-In

**Meet Marcus.** Mid-tier manager who loves banter more than waiver wires. It's Tuesday after a tough Week 9 loss.

- **Opening Scene:** Marcus lost by 4 points. He opens the HML site on his phone during lunch looking for ammunition.
- **Rising Action:** He pulls up the head-to-head rivalry page. His franchise has won 7 of the last 10 all-time — including a playoff win two seasons ago.
- **Climax:** He screenshots it and fires it into the group chat: *"Enjoy it while it lasts. History says I own you."*
- **Resolution:** The chat lights up. He checks power rankings (still 5th) and bookmarks the rivalry page.

**Capabilities:** Head-to-head rivalry records, shareable URLs, mobile layout, power rankings.

---

### Journey 2: The Stats Nerd — Deep Historical Dive

**Meet Jordan.** In the HML since the original 10-team league. Convinced he has the best draft history and wants to prove it.

- **Opening Scene:** Jordan pulls up his franchise page to see every rookie pick going back to the legacy era.
- **Rising Action:** Draft history is organized by year — startup draft, then every rookie draft. His 2021 first-rounder was a league-winner. Someone else's 2022 pick was a bust.
- **Climax:** All-time leaderboard confirms his franchise has the highest career points scored. Top 3 in wins across both league eras.
- **Resolution:** He shares the career stats link. The chat erupts into a 45-minute argument about who's actually the best dynasty manager in HML history.

**Capabilities:** Franchise pages, per-year owner attribution, draft history by team and year, all-time leaderboard, career legacy stats, legacy league data.

---

### Journey 3: The Commish — Publishing a Weekly Recap *(Phase 2)*

**Meet Blake.** It's Wednesday morning, Week 11. The site has auto-drafted a recap from last week's Sleeper data.

- **Opening Scene:** Blake logs in and opens the auto-generated recap draft.
- **Rising Action:** Scores and highlights are correct. He adds a personal note about the week's biggest blowout and a dig at the manager who started an injured player.
- **Climax:** He edits, previews, and publishes. Recap goes live immediately.
- **Resolution:** Members respond in the group chat within an hour. The newsletter took 15 minutes instead of an hour.

**Capabilities (Phase 2):** Commish admin login, auto-generated recap from Sleeper data, editable newsletter interface, publish workflow, homepage newsletter display.

---

### Journey 4: The New Manager — Getting Oriented

**Meet Taylor.** Just joined as an expansion manager, taking over an existing franchise. First time playing dynasty.

- **Opening Scene:** Commish sends a link to the HML site. Taylor lands on the homepage.
- **Rising Action:** Taylor finds their franchise page — previous owner by year, draft picks, season records, trophies. The franchise was a playoff contender two seasons ago.
- **Climax:** Taylor browses the league history timeline and all-time leaderboard to understand the competition.
- **Resolution:** Taylor is oriented without asking the commish a single question.

**Capabilities:** Franchise pages with year-attributed ownership, league history timeline, public access with no login.

---

### Journey 5: The Dynasty Manager — Player Status Check

**Meet Darnell.** Saturday afternoon. A star RB just got traded in real life — dynasty value shifted. Darnell wants to know who owns him in the HML.

- **Opening Scene:** Darnell searches the player by name on the HML site.
- **Rising Action:** Player page shows current HML owner, NFL team (updated at last sync), injury designation. The sync ran this morning — the NFL trade happened this afternoon, so it won't reflect until tomorrow's pull.
- **Climax:** Player is owned by Marcus's franchise. Darnell notes the sync timestamp, understands the lag, and reaches out via the Sleeper app.
- **Resolution:** He got the context he needed. The 24-hour player data lag is acceptable; matchup scores are near-live.

**Capabilities:** Player search, roster ownership display, NFL status/injury designation, sync timestamp.

---

### Journey Requirements Summary

| Capability | Phase | Journeys |
|---|---|---|
| Head-to-head rivalry records | MVP | 1, 2 |
| Power rankings | MVP | 1 |
| Mobile-friendly layout | MVP | 1, 5 |
| Franchise pages (persistent, year-attributed ownership) | MVP | 2, 4 |
| Draft history by team & year (incl. legacy) | MVP | 2 |
| All-time leaderboard & career legacy stats | MVP | 2 |
| Legacy league data integration | MVP | 2, 4 |
| League history timeline | MVP | 4 |
| Public access, no login required | MVP | 4 |
| Player search + NFL status/injury display | MVP | 5 |
| Sync timestamp ("Last updated") visible sitewide | MVP | 5 |
| Commish admin panel + newsletter workflow | Phase 2 | 3 |
| Auto-generated recap drafts from Sleeper data | Phase 2 | 3 |

## Domain-Specific Requirements

### Sleeper API Endpoints

All endpoints are read-only; no authentication token required.

| Data | Endpoint |
|---|---|
| League info & settings | `GET /v1/league/<league_id>` |
| Rosters | `GET /v1/league/<league_id>/rosters` |
| Users/managers in league | `GET /v1/league/<league_id>/users` |
| Weekly matchups | `GET /v1/league/<league_id>/matchups/<week>` |
| Playoff brackets | `GET /v1/league/<league_id>/winners_bracket` |
| Transactions (trades, waivers) | `GET /v1/league/<league_id>/transactions/<week>` |
| Traded future picks | `GET /v1/league/<league_id>/traded_picks` |
| All drafts for a league | `GET /v1/league/<league_id>/drafts` |
| Draft picks | `GET /v1/draft/<draft_id>/picks` |
| All NFL players (5MB) | `GET /v1/players/nfl` |
| NFL state (current week/season) | `GET /v1/state/nfl` |

### Sync Architecture

| Job | Cadence | Data |
|---|---|---|
| **Daily sync** | Once per day | Player database (~5MB), league settings, historical data |
| **Hourly sync** | Every 60 minutes | Transactions, trades, rosters, traded picks, waiver activity |
| **Game-window poller** | Every 30 seconds (active windows only) | Matchup scores only |

Game-window poller uses `/v1/state/nfl` to determine active periods (Sundays, Monday nights, Thursday nights, playoffs).

### Technical Constraints

- **Read-only** — all data flows one direction: Sleeper → HML site
- **Rate limit** — stay under 1,000 API calls/minute across all sync jobs
- **Players endpoint** — ~5MB payload, once per day maximum; stored/cached locally, never fetched on demand
- **Username instability** — always store and reference `user_id`; resolve display names at render time
- **roster_id mapping** — maintain a versioned `roster_id → user_id → franchise` mapping per season

### Legacy League Chaining

Sleeper leagues expose a `previous_league_id` field. The HML sync layer must traverse this chain year by year to pull league, roster, matchup, and draft data for all historical seasons. Transactions endpoint is per-week — full trade history requires iterating all weeks across all seasons. Any seasons pre-dating Sleeper cannot be API-synced and require manual data entry.

### Integration Risk Mitigations

| Risk | Mitigation |
|---|---|
| IP block from excessive calls | Batch sync jobs; never call Sleeper on page load |
| Players endpoint size (5MB) | Fetch once daily; serve from local cache only |
| Sleeper API downtime | Serve last-cached data; display sync timestamp |
| Legacy data gaps | Audit all historical seasons pre-launch; plan manual import for gaps |
| roster_id / user_id drift | Maintain versioned mapping per season |
| Username changes | Store by `user_id`; resolve display name at render time |

## Web Application Requirements

- **Rendering model:** Server-side rendered MPA; each route returns a complete HTML page
- **Real-time layer:** Game-window score poller handled client-side via lightweight JavaScript fetch; no SPA architecture required
- **Data flow:** All pages served from locally cached Sleeper data; no live Sleeper calls on page load
- **Browser support:** Current and previous major versions of Chrome, Firefox, Safari, Edge; no legacy browser support
- **Responsive design:** All pages render on mobile, tablet, and desktop; mobile is first-class (checking scores, rivalry records, player status)
- **Tables on mobile:** Standings, leaderboards, and stat tables use horizontal scroll or card layout on small screens
- **URLs:** Clean, shareable routes (e.g., `/teams/franchise-name`, `/history/2023`, `/drafts/2022`)
- **SEO:** Not a priority; standard semantic HTML is sufficient
- **Color blindness:** One league member cannot reliably distinguish reds and purples; all color-coded UI must include a secondary indicator (label, icon, or pattern); red/purple pairings avoided as primary data signals

## Functional Requirements

### League History & Season Timeline

- **FR1:** Visitors can view a chronological timeline of all HML seasons, including legacy 10-team era seasons
- **FR2:** Visitors can view season-level summaries including final standings, champion, and notable stats for any historical season
- **FR3:** Visitors can navigate to any individual season's detail view from the timeline
- **FR4:** The system links historical seasons across the legacy and current league using Sleeper's `previous_league_id` chain

### Team Franchise Pages

- **FR5:** Visitors can view a dedicated page for each franchise showing its complete history across all seasons
- **FR6:** Each franchise page displays the owner attributed to each season year
- **FR7:** Franchise pages display season-by-season records, standings finishes, and championship results
- **FR8:** Franchise identity (team name, branding) persists across ownership changes

### Scoring & Matchups

- **FR9:** Visitors can view weekly matchup scores for the current season
- **FR10:** Matchup scores refresh automatically during active NFL game windows without requiring a page reload
- **FR11:** Visitors can view the full weekly schedule and results for any historical season
- **FR12:** Visitors can view playoff bracket results for any completed season
- **FR13:** Visitors can view individual matchup details including team scores and rosters for any historical week

### Records, Rankings & Rivalries

- **FR14:** Visitors can view the all-time leaderboard ranking all franchises by career performance metrics (wins, points scored, championships)
- **FR15:** Visitors can view head-to-head records between any two franchises across all seasons
- **FR16:** Visitors can view rivalry summaries including win streaks, notable matchups, and historical trends
- **FR17:** Visitors can view the current power rankings
- **FR18:** Visitors can view career legacy stats for any franchise spanning all seasons including legacy era
- **FR19:** Visitors can view the trophy case displaying all-time awards and championship history

### Draft History

- **FR20:** Visitors can view the complete draft history for any franchise, including startup draft and all annual rookie drafts
- **FR21:** Draft history displays picks by round and year, attributed to the owning franchise at time of draft
- **FR22:** Visitors can view any historical draft in full (all teams, all picks, all rounds)
- **FR23:** Draft history covers all seasons including legacy era

### Player Information

- **FR24:** Visitors can search for any NFL player by name
- **FR25:** Player results display the player's current HML roster owner, NFL team, position, and injury/status designation
- **FR26:** Player status reflects the most recent Sleeper data sync
- **FR27:** Visitors can view the full roster for any franchise

### Data Sync & Freshness

- **FR28:** The system syncs the full player database from Sleeper once per day
- **FR29:** The system syncs transactions, trades, rosters, and traded picks from Sleeper once per hour
- **FR30:** The system syncs matchup scores from Sleeper every 30 seconds during active NFL game windows
- **FR31:** The system uses the NFL state endpoint to determine active game windows and activates/deactivates the score poller accordingly
- **FR32:** Every page displays a "Last updated" timestamp indicating when data was last synced
- **FR33:** The system maintains a versioned mapping of `roster_id → user_id → franchise` per season

### Accessibility & Navigation

- **FR34:** All pages are accessible without a login or account
- **FR35:** All pages render correctly on mobile, tablet, and desktop screen sizes
- **FR36:** All color-coded information is conveyed through labels, icons, or patterns in addition to color
- **FR37:** All major content pages have clean, shareable URLs
- **FR38:** Visitors can navigate between all major sections from a persistent navigation element

## Non-Functional Requirements

### Performance

- **NFR1:** Standard content pages (history, franchise, standings, leaderboard) load within 3 seconds on a modern mobile connection
- **NFR2:** Matchup score updates during game windows are reflected on-screen within 5 seconds of the 30-second poll completing
- **NFR3:** Player search returns results within 2 seconds of query submission
- **NFR4:** All data is served from local cache; no page load triggers a live Sleeper API call

### Reliability

- **NFR5:** The site remains accessible during Sleeper API outages — all pages serve last-cached data rather than returning errors
- **NFR6:** Daily and hourly sync jobs complete without manual intervention; failed syncs are logged and retried automatically
- **NFR7:** The game-window poller degrades gracefully on Sleeper API errors — displays last known scores with timestamp rather than blank or broken state
- **NFR8:** Site targets 99%+ uptime, particularly September through January (active NFL season)

### Integration

- **NFR9:** All three sync jobs combined stay under Sleeper's 1,000 calls/minute rate limit
- **NFR10:** The system stores `user_id` as the stable identifier for all historical data; display names resolved at render time
- **NFR11:** A sync failure for one data type does not block or corrupt other data types

### Accessibility

- **NFR12:** No information is conveyed by color alone — all color-coded UI elements include a secondary indicator (label, icon, or pattern)
- **NFR13:** The site avoids red/purple color pairings as primary data signals
- **NFR14:** The site meets WCAG 2.1 AA contrast ratio standards for text and interactive elements
