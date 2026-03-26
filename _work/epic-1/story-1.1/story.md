# Story 1.1: Project Scaffolding

## Story
As a developer,
I want the project initialized with the correct tech stack and folder structure,
So that all subsequent development has a consistent foundation.

## Acceptance Criteria

**Given** no existing project setup
**When** the scaffolding script runs
**Then** the project is created with Next.js 16+ (App Router), TypeScript strict mode, Tailwind CSS v4, ESLint, and Turbopack
**And** Drizzle ORM, @vercel/postgres, Zod, drizzle-zod, and Playwright are installed
**And** shadcn/ui is initialized with the project
**And** the `@/*` import alias is configured
**And** the folder structure matches the architecture spec (app/, components/, lib/, e2e/)

## Notes
- This is the foundation story; nothing else can start until this is complete
- Use the architecture doc's initialization command as reference
- The project already exists but may need dependency updates or restructuring to match the new architecture
