# Pipeline Process

## Overview

The pipeline processes one story at a time through a sequence of specialized agents. Each story flows from requirements analysis through development, review, testing, and ship. A Knowledge Agent backed by a file-based knowledge base (`_work/knowledge-base.md`) provides institutional memory across stories, replacing redundant document reads with targeted on-demand queries.

Stories execute sequentially: a story is fully shipped before the next begins. Within a single story, agents can run in parallel where the pipeline allows (e.g., BEND + FEND).

---

## Pipeline Flow

```
ORCHESTRATOR picks next story from pipeline-state.json
  |
  v
[KNOWLEDGE AGENT (Haiku)] <-- always running, available to ALL agents + orchestrator
  |   Backed by file-based knowledge base (_work/knowledge-base.md)
  |   Responds to on-demand queries from any agent
  |   Provides slim startup briefs (2-3k tokens) at agent startup
  |
  v
ORCHESTRATOR: cp template.md -> story prompt, fill in blanks, spawn
  |
  v
[REQS (Sonnet)] --> Implementation Brief
  |   Reads: epic AC + targeted requirements sections (2-3 of 10)
  |   Startup brief from Knowledge Agent: domain context, prior corrections
  |   On-demand queries for specific patterns
  |   Output: structured brief + TL;DR header for orchestrator
  |   State: -> reqs-complete
  |   Stays alive for the full story
  |
  v
[UXA (Sonnet)] --> Component & Interaction Spec
  |   Reads: REQS brief + targeted UX spec sections
  |   Startup brief from Knowledge Agent: prior component patterns
  |   On-demand queries for specific UI patterns
  |   Output: structured spec + TL;DR header for orchestrator
  |   State: -> uxa-complete
  |   Stays alive for the full story
  |
  v
[QA PHASE A (Sonnet)] --> Test Plan (markdown, NOT test code)
  |   Reads: REQS brief + UXA spec
  |   Startup brief from Knowledge Agent: test patterns, auth setup conventions
  |   Outputs structured test plan:
  |     - Test files to create and where they live
  |     - Each test case: name, what to assert, seed data needed
  |     - API tests: endpoint, method, expected status, DB state to verify
  |     - E2E tests: user flow steps, selectors to target, expected outcomes
  |     - PMCP visual checklist: 3-5 key flows for screenshot validation
  |     - Coverage matrix: AC clause -> test case mapping
  |   Writes plan to qa-test-plan.md
  |   State: -> qa-plan-complete
  |   Shuts down after plan is written (Phase B is a separate Opus agent)
  |
  v
[JUDGE GATE 1 (Sonnet)] --> Test Plan Completeness Review
  |   Reads: test plan + REQS brief + UXA spec
  |   Reviews plan against ACs
  |   Verdict: APPROVED -> judge-g1-approved / REWRITE -> judge-g1-rewrite
  |   Stays alive for the full story (wakes up again for bug severity review)
  |
  v
[BEND (Opus)] + [FEND (Opus)] (parallel) --> Production Code + Test Code
  |   Reads: REQS brief + UXA spec + test plan + cross-story context
  |   BEND writes: backend modules, services, migrations, schemas,
  |                AND API test code implementing the test plan
  |   FEND writes: frontend components, hooks, pages, routes,
  |                AND E2E test code implementing the test plan
  |   Both self-validate by running their tests
  |   Both query Knowledge Agent on-demand for patterns
  |   State: -> dev-complete (when both finish)
  |   Both stay alive for the full story
  |
  v
[CRITIC (Sonnet)] --> Code Review (production code AND test code)
  |   Reads: full git diff + REQS brief
  |   Reviews BOTH production code and test code with equal hostility
  |   Test code review: do tests match the plan? Do they verify DB state?
  |     Are assertions meaningful? Would they catch a regression?
  |     If a test only asserts on response body without DB verification: REJECT
  |   Queries Knowledge Agent for: prior violations, approved patterns
  |   Tags: [CONVENTION], [PITFALL], [VIOLATION-FIXED]
  |   Verdict: APPROVED -> critic-approved / REJECTED -> critic-rejected
  |            (on reject: messages BEND/FEND directly, they fix with full context)
  |   Stays alive for the full story
  |
  v
[QA PHASE B (Opus)] --> Test Validation + Execution + Visual Check + Bug Filing
  |   (Separate Opus agent; reads test plan from qa-test-plan.md)
  |
  |   Step 1: REVIEW - compare implemented tests against the test plan
  |   Step 2: EXECUTE - run full E2E + API test suites
  |   Step 3: TRIAGE - group failures by root cause, categorize for prioritization
  |   Step 4: BUG FILING - file bugs with priority (P1-P4), route to BEND/FEND
  |   Step 5: VISUAL VALIDATION - via Haiku PMCP Agent (orchestrator-spawned)
  |   Step 6: REPORT - tagged lessons, execution report for JUDGE Gate 2
  |   State: -> qa-executed
  |
  v
[JUDGE GATE 1 (Sonnet)] wakes up --> Bug Severity Review
  |   Already alive with test plan and REQS brief context
  |   Reads: ALL bugs from bugs.md (resolved and open)
  |   Cross-references every bug against test plan and ACs
  |   Validates or reclassifies priorities in either direction
  |   State: -> bugs-reviewed
  |
  v
[JUDGE GATE 2 (Haiku)] --> Final Ship Review
  |   Reads: test results + coverage matrix + REQS brief + bugs.md
  |   Checklist: all P1-P3 resolved, bugs reviewed by G1, tests green,
  |              tests match plan, PMCP evidence present, no assertion weakening
  |   Verdict: SHIP -> shipped / REWRITE -> judge-g2-rewrite
  |
  v
Story Complete: SHIP
  |
  v
ALL remaining agents shut down (REQS, UXA, JUDGE G1, BEND, FEND, CRITIC, QA Phase B)
P4 bugs from bugs.md copied to _work/bug-backlog.md
  |
  v
[git commit] --> triggers embed pipeline
  |
  v
[EMBED (Haiku)] --> Appends to _work/knowledge-base.md:
     - Tagged patterns from CRITIC review
     - Tagged lessons from QA Phase B report
     - Story summary from handoffs
     - Updated cross-story context
  |
  v
ORCHESTRATOR picks next story (Knowledge Agent now has this story's lessons)
```

---

## Agent Roles

| Agent | Model | Role | Lifecycle |
|---|---|---|---|
| REQS | Sonnet | Requirements analysis; translates ACs into implementation brief | Alive for full story |
| UXA | Sonnet | UX analysis; translates UX spec into component specs | Alive for full story |
| QA Phase A | Sonnet | Writes test plan (markdown, not code) | Shuts down after plan is written |
| JUDGE Gate 1 | Sonnet | Reviews test plan completeness; validates ALL bug severities | Alive for full story (activated twice) |
| BEND | Opus | Backend development: production code + API test code from plan | Alive for full story |
| FEND | Opus | Frontend development: production code + E2E test code from plan | Alive for full story |
| CRITIC | Sonnet | Code review: production code AND test code, diff-first | Alive for full story |
| QA Phase B | Opus | Test validation, execution, triage, bug filing, visual checks | Alive for full story |
| JUDGE Gate 2 | Haiku | Final ship decision | Spawned at end, shuts down with verdict |
| Knowledge Agent | Haiku | On-demand knowledge retrieval from knowledge base file | Persistent across stories |
| PMCP Agent | Haiku | Visual validation via Playwright MCP | Spawned per QA request, shuts down after |
| Embed Agent | Haiku | Appends shipped story artifacts to knowledge base file | Spawned after ship, shuts down after |
| Orchestrator | Opus | Lightweight dispatcher; template-based spawning, TL;DR parsing | User session |

---

## State Transitions

| Agent | On Success | On Failure |
|---|---|---|
| REQS | `analysis` -> `reqs-complete` | N/A |
| UXA | `reqs-complete` -> `uxa-complete` | N/A |
| QA Phase A | `uxa-complete` -> `qa-plan-complete` | N/A |
| JUDGE Gate 1 | `qa-plan-complete` -> `judge-g1-approved` | -> `judge-g1-rewrite` (back to QA) |
| BEND | `judge-g1-approved` -> `bend-complete` | N/A |
| FEND | `judge-g1-approved` -> `fend-complete` | N/A |
| CRITIC | `dev-complete` -> `critic-approved` | -> `critic-rejected` (back to devs) |
| QA Phase B | `critic-approved` -> `qa-executed` | -> `qa-bugs-filed` (devs fix, QA re-runs) |
| JUDGE Gate 1 (bug review) | `qa-executed` -> `bugs-reviewed` | -> `bugs-reclassified` |
| JUDGE Gate 2 | `bugs-reviewed` -> `shipped` | -> `judge-g2-rewrite` |

---

## Three-Way Test Separation

```
QA (Sonnet) writes the TEST PLAN     --> defines WHAT to test (before code exists)
BEND/FEND (Opus) write the TEST CODE --> implements HOW to test it (alongside code)
QA (Opus) VALIDATES the match         --> verifies code matches plan (after code exists)
```

---

## Standing Rules

- Adversarial review: CRITIC and JUDGE are hostile by design
- No mocks: enforced by CRITIC on all test code
- Full regression: all failures fixed, no exceptions
- No self-approval: QA plans, devs implement, QA validates
- Cross-story context files maintained and embedded
- Planning artifacts remain source of truth
- Production code quality is non-negotiable
- Test validation expertise is non-negotiable
