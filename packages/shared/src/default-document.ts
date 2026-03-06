export const DEFAULT_PAGE_MARKDOWN = `# Untitled

Write anything here — this is your **free-form document**.

## Getting started

Use markdown to structure your content:

- **Bold** and *italic* text for emphasis
- Lists for organizing thoughts
- Code blocks for technical notes

> Blockquotes are great for highlighting key ideas or quotes.

## Next steps

1. Replace this content with your own
2. Use the split editor to see raw markdown side-by-side
3. Organize pages into projects from the sidebar
`

export const DEFAULT_KNOWLEDGE_MARKDOWN = `---
board: Knowledge Base
description: Decisions, patterns, and reference material
tags:
  - knowledge
---

# Decisions

## Use parameterized queries for all SQL knowledge:true #security #database

Prevents SQL injection. All database access must use parameterized queries — no string concatenation.

## Next steps

Add entries with \`## Title\` headings. Use \`#tags\` for categorization and \`knowledge:true\` for AI discoverability.
`

export const DEFAULT_MARKDOWN = `---
board: Sprint Board
description: Example board with tasks, descriptions, and acceptance criteria
---

# Backlog

## Implement OAuth2 social login (Google, GitHub) @maya @john #backend #auth priority:high est:12h created-by:sarah

Set up Google and GitHub social login providers for the application.

> Users can sign in with Google
> Users can sign in with GitHub
> Session persists across page refresh
> Failed auth shows a clear error message

- [ ] Configure OAuth providers
- [ ] Build callback handlers
- [ ] Add session management

## Build notification center with real-time updates @alex #frontend #websocket priority:medium est:8h due:2025-04-15 created-by:maya

## Write E2E test suite for checkout flow @bob #testing #qa est:6h created-by:john

## Set up Stripe webhook handlers @john #backend #payments priority:high due:2025-03-28 est:4h created-by:sarah

> Webhooks process within 5 seconds of event
> Failed webhooks retry with exponential backoff
> Duplicate events are handled idempotently

- [ ] Handle payment_intent.succeeded
- [ ] Handle subscription lifecycle events
- [ ] Add idempotency keys

## Design dark mode theme tokens @sarah #design #frontend est:3h created-by:alex

## Add CSV export for admin dashboard @maya #backend #analytics priority:low est:2h created-by:bob

# In Progress

## Migrate database to PostgreSQL 16 @alex #backend #infra priority:high due:2025-03-22 est:10h created-by:sarah

## Build user settings page with avatar upload @sarah #frontend #design est:5h created-by:maya

## Refactor API error handling middleware @john #backend #dx priority:medium est:3h created-by:alex

# In Review

## Add rate limiting to public endpoints @bob @john #backend #security priority:high due:2025-03-18 est:4h created-by:sarah

## Redesign onboarding flow with stepper component @sarah @maya #frontend #ux est:6h created-by:alex

# Done

## [x] Set up monorepo with Turborepo @alex #infra #dx created-by:alex built-by:alex

## [x] Configure CI pipeline with GitHub Actions @bob #devops #infra created-by:sarah built-by:bob

## [x] Implement JWT refresh token rotation @john #backend #auth priority:high created-by:maya built-by:john

### Learnings
- Access tokens should be short-lived (15min), refresh tokens long-lived (7d) #jwt #security
- Store refresh tokens in httpOnly cookies, NOT localStorage #session #xss
- Rotate refresh tokens on every use to detect token theft #token-rotation

## [x] Build reusable form components library @sarah #frontend #design est:8h created-by:sarah built-by:sarah

## [x] Deploy staging environment to Fly.io @alex @bob #devops #infra created-by:bob built-by:alex

## [x] Add Sentry error tracking integration @maya #monitoring #dx created-by:john built-by:maya
`
