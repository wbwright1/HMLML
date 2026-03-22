---
name: pipeline
description: Reference document describing the full story pipeline process, agent roles, state transitions, and standing rules. Not an agent itself; loaded by the orchestrator for pipeline context.
model: inherit
tools: Read, Glob, Grep
---

# Pipeline Process

## Overview

The pipeline processes one story at a time through a sequence of specialized agents. Each story flows from requirements analysis through development, review, testing, and ship. A Knowledge Agent backed by ChromaDB provides institutional memory across stories, replacing redundant document reads with targeted on-demand queries.

Stories execute sequentially: a story is fully shipped before the next begins. Within a single story, agents can run in parallel where the pipeline allows (e.g., BEND + FEND).

---

## Pipeline Flow

```
ORCHESTRATOR picks next story from pipeline-state.json
  |
  v
[KNOWLEDGE AGENT (Haiku)] <-- always running, available to ALL agents + orchestrator
  |   Backed by ChromaDB knowledge base (code + patterns + lessons)
  |   Responds to on-demand queries from any agent
  |   Provides slim startup briefs (2-3k tokens) at agent startup
  |
  v
ORCHESTRATOR: cp template.md -> story prompt, fill in blanks, spawn
  |
  v
[REQS (Sonnet)] --> Implementation Brief
  |   Reads: epic AC + targeted PRD sections (2-3 relevant sections)
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
  |   Startup brief from Knowledge Agent: test patterns, setup conventions
  |   Outputs structured test plan:
  |     - Test files to create and where they live
  |     - Each test case: name, what to assert, seed data needed
  |     - API/integration tests: endpoint, method, expected status, DB state to verify
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
  |   BEND writes: backend modules, data access, API routes, schema/migrations,
  |                AND integration/API test code implementing the test plan
  |   FEND writes: components, hooks, pages, routes,
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
  |   Step 2: EXECUTE - run full test suites
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
[git commit to main] --> triggers embed pipeline
  |
  v
[EMBED (Haiku)] --> Indexes into ChromaDB:
     - Tagged patterns from CRITIC review
     - Tagged lessons from QA Phase B report
     - Current state of changed source files (chunked by function/class)
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
| BEND | Opus | Backend development: production code + API/integration test code from plan | Alive for full story |
| FEND | Opus | Frontend development: production code + E2E test code from plan | Alive for full story |
| CRITIC | Sonnet | Code review: production code AND test code, diff-first | Alive for full story |
| QA Phase B | Opus | Test validation, execution, triage, bug filing, visual checks | Alive for full story |
| JUDGE Gate 2 | Haiku | Final ship decision | Spawned at end, shuts down with verdict |
| Knowledge Agent | Haiku | On-demand knowledge retrieval from ChromaDB | Persistent across stories |
| PMCP Agent | Haiku | Visual validation via Playwright MCP | Spawned per QA request, shuts down after |
| Embed Agent | Haiku | Indexes shipped story artifacts into ChromaDB | Spawned after ship, shuts down after |
| Orchestrator | Opus | Lightweight dispatcher; template-based spawning, TL;DR parsing | User session |

**Max concurrent alive agents**: ~8 (REQS, UXA, JUDGE G1, BEND, FEND, CRITIC, QA Phase B, JUDGE G2). Most are idle at any given time, costing zero tokens. Only 1-2 are actively processing.

---

## Agent Lifecycle Within a Story

All agents stay alive until the story ships, with one exception: QA Phase A (Sonnet) shuts down after writing the test plan file.

```
Story begins
  |
  v
REQS spawns (Sonnet) -> writes brief -> goes idle (stays alive)
UXA spawns (Sonnet) -> writes spec -> goes idle (stays alive)
QA Phase A spawns (Sonnet) -> writes test plan -> shuts down (plan is a file)
JUDGE Gate 1 spawns (Sonnet) -> verdict -> goes idle (stays alive)
BEND + FEND spawn in parallel (Opus) -> write code + tests -> go idle (stay alive)
CRITIC spawns (Sonnet) -> reviews -> goes idle (stays alive)
QA Phase B spawns (Opus) -> validates, executes, triages, files bugs
  -> P1-P3 bugs: messages BEND or FEND directly (they wake up and fix)
  -> loop until P1-P3 resolved and suite green
  -> PMCP: messages orchestrator, who spawns Haiku PMCP Agent
JUDGE Gate 1 wakes up -> reviews ALL bug severities against test plan/ACs
  -> if reclassification: QA Phase B routes to devs, re-runs, loop
JUDGE Gate 2 spawns (Haiku) -> verdict
  -> if SHIP: ALL agents shut down, Knowledge Agent indexes everything
  -> if REJECT: relevant agents wake up to address issues, cycle resumes
```

Keeping agents alive enables:
- CRITIC can ask REQS: "What did you mean by this requirement?"
- QA Phase B can ask UXA: "Is this the expected behavior for this edge case?"
- BEND can ask FEND: "What component name did you use for this?"
- Bug fixes go to the dev who wrote the code, with full context, zero reload
- JUDGE Gate 1 has full test plan context for bug severity review (no reload)
- JUDGE Gate 2 rejections route to the right agent immediately

---

## State Transitions

Agents update `pipeline-state.json` directly based on their rulesets. The orchestrator no longer mediates every transition.

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
| JUDGE Gate 1 (bug review) | `qa-executed` -> `bugs-reviewed` | -> `bugs-reclassified` (QA routes reclassified bugs) |
| JUDGE Gate 2 | `bugs-reviewed` -> `shipped` | -> `judge-g2-rewrite` (back to relevant agent) |

---

## Three-Way Test Separation

```
QA (Sonnet) writes the TEST PLAN     --> defines WHAT to test (before code exists)
BEND/FEND (Opus) write the TEST CODE --> implements HOW to test it (alongside code)
QA (Opus) VALIDATES the match         --> verifies code matches plan (after code exists)
```

No single agent controls both "what to test" and "how it's tested." QA defines the spec. Devs implement it. QA verifies the implementation matches.

| Risk | Safeguard |
|---|---|
| Dev writes tautological test (always passes) | CRITIC reviews test code with same hostility as production code |
| Dev skips a test case from the plan | QA Phase B Step 1 compares tests against plan |
| Dev only asserts on response body, not DB state | CRITIC rejects; test plan explicitly requires DB verification |
| Dev uses mocks or test doubles | CRITIC mock hunt |
| Test passes when feature is deleted | JUDGE Gate 1 evaluates against the plan; CRITIC evaluates against code |

---

## Knowledge Agent

The Knowledge Agent is a persistent Haiku teammate backed by ChromaDB. It serves as institutional memory.

**Two functions:**

1. **Startup briefs**: When an agent begins work, the Knowledge Agent sends a slim brief (2-3k tokens) with the highest-signal patterns for that agent's role and the story's domain.

2. **On-demand queries**: Any agent can message the Knowledge Agent mid-task with a specific question. The Knowledge Agent queries ChromaDB, retrieves relevant chunks, and responds with targeted context.

**What it does NOT do:**
- Make decisions about code quality (CRITIC's job)
- Make decisions about test completeness (JUDGE's job)
- Write code or tests (BEND/FEND's job)
- Write test plans (QA's job)
- Extract patterns autonomously (CRITIC/QA tag explicitly)
- Only retrieves and synthesizes from the knowledge base

---

## Haiku PMCP Agent

Teammates cannot spawn sub-agents; only the orchestrator can. The PMCP Agent is spawned by the orchestrator at QA's request, with all communication through files.

**Flow:**

```
QA Phase B reaches visual validation step
  |
  v
QA writes checklist to _work/epic-N/story-N.N/pmcp-checklist.md
  |
  v
QA messages orchestrator: "Ready for visual validation."
  |
  v
ORCHESTRATOR spawns Haiku PMCP Agent with file reference
  |
  v
Haiku PMCP Agent:
  - Executes each step using Playwright MCP tools
  - Takes screenshots at each checkpoint
  - Writes pmcp-results.md with pass/fail per step
  - Shuts down when complete
  |
  v
ORCHESTRATOR messages QA: "PMCP complete. Results at pmcp-results.md."
  |
  v
QA reads results, reviews screenshots for visual issues
  - If issues found: files bug to FEND with screenshot evidence
```

---

## QA Phase B Detailed Flow

```
QA Phase B starts
  |
  v
Step 1: REVIEW
  Compare implemented tests against the test plan
  Every test case in the plan must have a corresponding test
  No assertions weakened or skipped
  If gaps: file bug to BEND/FEND
  |
  v
Step 2: EXECUTE
  Run the project's test suites (per the test commands defined in the architecture)
  |
  v
All green? --> skip to Step 5
  |
  v (failures exist)
Step 3: TRIAGE
  QA (Opus) triages failures directly:
    - Groups failures by likely root cause
    - Categorizes for prioritization
  QA queries Knowledge Agent for prior fixes to similar failures
  |
  v
Step 4: BUG FILING
  QA files bugs to bugs.md with proposed priority (P1-P4) and route (BEND/FEND)
  P1-P3: QA messages BEND/FEND directly (still active with full context)
  P4: logged but not sent to devs yet (held for JUDGE Gate 1 review)
  BEND/FEND fix P1-P3 with full context (no reload)
  QA re-runs until green
  |
  v
Step 5: VISUAL VALIDATION
  QA writes checklist to pmcp-checklist.md
  QA messages orchestrator requesting PMCP validation
  ORCHESTRATOR spawns Haiku PMCP Agent
  QA reviews results and screenshots
  If issues: files bug to FEND with screenshot evidence
  |
  v
Step 6: REPORT
  Tags [WIRING-FIX], [TEST-PATTERN], [SETUP-PATTERN] lessons
  Produces execution report + coverage matrix for JUDGE Gate 2
```

All failures must be fixed. No "pre-existing" exceptions. The regression suite must be green before a story ships.

---

## Bug Management

### Priority Tiers

| Priority | Name | Definition | Ship Blocker? |
|---|---|---|---|
| **P1** | Blocker | Feature doesn't work. Core AC fails. Data corruption. Security hole. | Yes |
| **P2** | Functional | Feature works but has a meaningful gap. Edge case fails. Validation missing. Wrong error message. | Yes |
| **P3** | Quality | Feature works correctly but implementation has issues. Performance concern. Accessibility gap. | Yes |
| **P4** | Polish | Cosmetic, UX nit, minor inconsistency. User can accomplish their goal. | **No** (backlog) |

### Bug Report Format

QA files bugs as structured entries in `_work/epic-N/story-N.N/bugs.md`:

```markdown
## BUG-[story]-[number]
- **Priority:** P[1-4] (proposed by QA)
- **Source:** [Test execution / Visual validation / Review]
- **Route to:** [BEND / FEND]
- **Summary:** [one-line description]
- **Expected:** [expected behavior]
- **Actual:** [actual behavior]
- **Test case:** [test plan reference]
- **AC reference:** [which AC this maps to]
- **Screenshot:** [path, if visual]
- **Status:** [OPEN / FIXED / RECLASSIFIED]
```

### Bug Lifecycle

```
QA Phase B finds issue
  |
  v
QA files bug in bugs.md with proposed priority and route
  |
  +--> P1-P3: message sent directly to BEND or FEND
  |      |
  |      v
  |    Dev fixes with full context (still alive, no reload)
  |      |
  |      v
  |    QA re-runs suite, updates bug status
  |
  +--> P4: stays in bugs.md as OPEN, not sent to devs
  |
  v
All P1-P3 resolved, suite green
  |
  v
JUDGE Gate 1 wakes up (already has test plan context)
  |
  v
Reviews ALL bugs against test plan and ACs:
  - Is each bug's priority correct?
  - Was any bug under- or over-classified?
  - Does any P4 actually map to a core AC?
  |
  +--> Reclassification needed: updates bugs.md, QA routes to devs if bumped up
  +--> All priorities confirmed: no changes needed
  |
  v
JUDGE Gate 2 final check:
  - All P1-P3 resolved?
  - All bugs reviewed by JUDGE Gate 1?
  - Coverage matrix green?
  |
  v
Story ships (P4 bugs move to _work/bug-backlog.md)
```

### Routing Logic

- **Backend test failure** (API response, DB state, data processing) -> BEND
- **UI test failure** (E2E, element not found, wrong text) -> FEND
- **Visual issue** (PMCP screenshot, layout, styling) -> FEND
- **Ambiguous**: QA includes both agents, makes routing call after investigation

---

## ChromaDB Knowledge Base

### Collections

| Collection | What's stored | Queried by |
|---|---|---|
| `build-patterns` | Backend and frontend patterns; schema conventions | BEND, FEND, QA |
| `critic-reviews` | Violations found, fixes applied, approved patterns (tagged by CRITIC) | BEND, FEND, CRITIC |
| `qa-lessons` | Wiring fixes, test fixture patterns, setup patterns (tagged by QA) | QA, BEND, FEND |
| `corrections` | Hotfixes, post-ship fixes, convention corrections | All agents |
| `story-context` | Cross-story summaries, endpoints, schemas | All agents |
| `source-code` | Current state of source files, chunked by function/class, indexed on commit | BEND, FEND, CRITIC |

### Metadata Schema

```typescript
interface ChunkMetadata {
  epic: number;
  story: string;
  domain: string[];
  agentRole: string[];
  patternType: string;  // "convention" | "pitfall" | "wiring-fix" | "correction" | "source-code" | "context"
  filePath?: string;
  commitHash?: string;
  timestamp: string;
}
```

### Embedding Triggers

| Trigger | What gets embedded |
|---|---|
| **git commit to main** (after SHIP) | Current state of all changed source files, chunked by function/class boundary. Replaces prior chunks for same file paths. |
| **CRITIC review completes** | Tagged patterns: `[CONVENTION]`, `[PITFALL]`, `[VIOLATION-FIXED]`. |
| **QA Phase B completes** | Tagged lessons: `[WIRING-FIX]`, `[TEST-PATTERN]`, `[SETUP-PATTERN]`. |
| **Cross-story context updated** | Full file re-embedded, replacing prior version. |
| **Hotfix/correction applied** | Tagged as `[CORRECTION]` with high priority for retrieval. |

### Tagging Protocol

CRITIC and QA tag patterns explicitly in their output. The Embed Agent reads these tags and indexes them with correct metadata. The Embed Agent never decides what's important; it only processes what CRITIC/QA tagged.

### Embedding Strategy

- **Model**: OpenAI text-embedding-3-small (prototype); nomic-embed-text via Ollama (production)
- **Chunk size**: 512-1024 tokens with 20% overlap
- **Chunking by type**: knowledge artifacts by tagged section, source code by function/class boundary, cross-story context by section heading
- **Dimensions**: 1536 (OpenAI) or 768 (nomic)

---

## Orchestrator Design

The orchestrator is a lightweight dispatcher, not a context-heavy project manager.

### Prompt Templates

Pre-written templates live in `_agents/prompts/`:

```
_agents/prompts/
  reqs-template.md
  uxa-template.md
  qa-plan-template.md
  judge-g1-template.md
  bend-template.md
  fend-template.md
  critic-template.md
  qa-exec-template.md
  judge-g2-template.md
```

Workflow per agent spawn:
1. Copy template: `cp _agents/prompts/bend-template.md _work/epic-N/story-N.N/bend-prompt.md`
2. Edit in story-specific details (story ID, file paths, notes from prior agents)
3. Spawn with: "Execute the prompt at `_work/epic-N/story-N.N/bend-prompt.md`"

Orchestrator output per spawn: ~200-300 tokens of targeted edits.

### Structured Agent Output

Every agent produces a TL;DR header for the orchestrator:

```markdown
---
## Orchestrator Summary
- **Agent**: [name]
- **Story**: [ID]
- **Verdict**: [result]
- **State transition**: [from] -> [to]
- **Flags for orchestrator**: [None / details]
- **Tags indexed**: [count and types]
---

## Full Content (for human review or detailed inspection)
[... detailed content ...]
```

The orchestrator reads only the summary header (~200-300 tokens) unless a flag indicates attention is needed.

### Orchestrator Workflow Per Agent

1. Pick next story from pipeline state
2. Copy template, fill in blanks (~200-300 tokens of edits)
3. Spawn agent with file reference
4. Read TL;DR when agent finishes (~200-300 tokens)
5. Check state: did the agent advance the pipeline? Any flags?
6. If clean: spawn next agent in sequence
7. If flagged: review details and decide how to handle
8. Between stories: confirm Knowledge Agent indexed the shipped work

### Orchestrator Uses the Knowledge Agent

The orchestrator can query the Knowledge Agent for:
- Prior CRITIC violations before spawning CRITIC
- Story state and last agent run for session recovery
- Test patterns for a domain before spawning QA

---

## Context Management

### File-Based Message Queues

The orchestrator never relays agent content. All inter-agent communication flows through structured files in `_work/epic-N/story-N.N/`:

- REQS writes `reqs-brief.md`. UXA reads it directly.
- UXA writes `uxa-spec.md`. QA reads it directly.
- QA writes `qa-test-plan.md`. JUDGE Gate 1 reads it directly.
- BEND writes `bend-handoff.md`. CRITIC reads it directly.
- FEND writes `fend-handoff.md`. CRITIC reads it directly.
- CRITIC writes `critic-review.md`. QA Phase B reads it directly.

### Structured Handoff Schemas

Each pipeline transition has a defined handoff schema. The producing agent writes the file; the consuming agent reads it.

**Example: BEND handoff (`bend-handoff.md`):**
```markdown
---
## Orchestrator Summary
- Agent: BEND
- Story: [ID]
- Verdict: COMPLETE
- State transition: judge-g1-approved -> bend-complete
- Flags: None
---

## For CRITIC
- Files created: [list with line counts]
- Files modified: [list with line counts]
- Patterns used: [list]
- Known limitations: [list]
- Decisions made: [list]
- Test results: [summary]
- Dependencies on FEND: [list]
```

### Conversation Checkpointing

At natural task boundaries, agents write checkpoint files enabling fast recovery if a session crashes.

**Checkpoint schema (`[agent]-checkpoint.json`):**
```json
{
  "agent": "BEND",
  "story": "2.5",
  "timestamp": "2026-02-23T14:30:00Z",
  "phase": "implementing",
  "completed": [
    {"file": "src/lib/some-module.ts", "hash": "abc123"}
  ],
  "remaining": [
    "Write tests per test plan items BE-T01 through BE-T12"
  ],
  "decisions": [
    "Used repository pattern for data access"
  ],
  "knowledgeAgentQueries": [
    "Q: data access pattern -> A: use Drizzle query builder with typed helpers"
  ]
}
```

Recovery cost: ~2-5k tokens vs. ~30-40k for full context replay.

### CRITIC Diff-First Pattern

1. Receive `git diff` + `git diff --stat` as primary context
2. Read REQS brief for intent
3. Read BEND/FEND handoff files for decisions and patterns used
4. Walk through review checklist against the diff
5. When something raises a question:
   a. Query Knowledge Agent first (cheap)
   b. If insufficient: read the full file (more expensive but sometimes necessary)
   c. If still insufficient: message BEND or FEND directly
6. Tag findings: `[CONVENTION]`, `[PITFALL]`, `[VIOLATION-FIXED]`
7. Write verdict with structured handoff for QA Phase B

---

## Infrastructure

| Component | Local Dev | Production |
|---|---|---|
| ChromaDB 1.5.1 | Docker container, port 8000, persistent volume | Railway service, persistent volume |
| Embedding API | OpenAI text-embedding-3-small | Same (swap to nomic-embed-text later) |
| Embed pipeline | Node.js script, triggered on git commit to main | Same |
| Knowledge Agent | Haiku teammate in agent team | Same |
| PMCP Agent | Spawned by orchestrator for visual validation | Same |

### Docker Compose Addition

```yaml
  chromadb:
    image: chromadb/chroma:1.5.1
    ports:
      - "8000:8000"
    volumes:
      - chroma_data:/chroma/chroma
    environment:
      - IS_PERSISTENT=TRUE
      - ANONYMIZED_TELEMETRY=FALSE
```

### Knowledge Package

A knowledge package or script directory should contain:
- ChromaDB client wrapper (connect, query, upsert, delete)
- Embedding helpers (chunk text, call embedding API, upsert to collection)
- Code chunker (parse source files into function/class-level chunks)
- Embed pipeline script (reads tagged CRITIC/QA output + git diff, indexes to ChromaDB)
- Knowledge Agent query helpers (build metadata filters, format retrieved chunks)

---

## Token Profile (Per Story)

| Stage | Estimated Tokens | Model |
|---|---|---|
| Knowledge Agent (all queries) | ~25-35k | Haiku |
| REQS+UXA | ~50-60k | Sonnet |
| QA Phase A (test plan) | ~30-40k | Sonnet |
| JUDGE Gate 1 (plan + bug review) | ~50-60k | Sonnet |
| BEND (+tests) | ~95-110k | Opus |
| FEND (+tests) | ~70-85k | Opus |
| CRITIC (+test review) | ~45-55k | Sonnet |
| QA Phase B (all-green) | ~40-50k | Opus |
| QA Phase B (with failures) | ~60-80k | Opus |
| Haiku PMCP Agent | ~15-25k | Haiku |
| JUDGE Gate 2 | ~35-40k | Haiku |
| Embed step | ~10-15k | Haiku |
| Orchestrator overhead | ~5-10k | Opus |
| **Total (all-green)** | **~455-520k** | |
| **Total (with failures)** | **~475-550k** | |

---

## Standing Rules

- Adversarial review: CRITIC and JUDGE are hostile by design
- No mocks: enforced by CRITIC on all test code
- Full regression: all failures fixed, no exceptions
- No self-approval: QA plans, devs implement, QA validates
- Cross-story context files maintained and embedded
- Planning artifacts remain source of truth
- BEND/FEND on Opus: production code quality is non-negotiable
- QA Phase B on Opus: test validation expertise is non-negotiable
- All conventions come from the project's architecture document and planning artifacts
