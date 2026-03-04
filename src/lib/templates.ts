import type { ItemType } from '@automd/shared'

export interface BoardTemplate {
  id: string
  name: string
  description: string
  icon: string
  itemType: ItemType
  markdown: string
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  // ─── Board Templates ────────────────────────────────────────────────
  {
    id: 'knowledge-base',
    name: 'Knowledge Base',
    description: 'Core memory — decisions, patterns, references',
    icon: 'brain',
    itemType: 'board',
    markdown: `---
vocabulary:
  domain: []
  importance:
    - critical
    - useful
    - reference
---

# Decisions

## Architecture decision knowledge:true #critical
Design decisions and their reasoning.

> Decision is documented with context and alternatives considered

### Learnings
- Document the "why" not just the "what" #decisions
- Include alternatives that were rejected and why #context

# Patterns

## Reusable pattern knowledge:true #useful
Patterns discovered across projects.

> Pattern is described with when to use and when not to

# References

## Key reference knowledge:true #reference
Important links, docs, and external resources.
`,
  },
  {
    id: 'sprint',
    name: 'Sprint Board',
    description: 'Agile development with backlog and review',
    icon: 'zap',
    itemType: 'board',
    markdown: `---
vocabulary:
  component: []
  type:
    - feature
    - bug
    - chore
---

# Backlog

## Implement user authentication #feature priority:high est:8h
Add login/signup flow with JWT tokens.

> Users can sign up with email and password
> Users can log in and receive a session token
> Invalid credentials show clear error messages

- [ ] Design auth API endpoints
- [ ] Implement JWT token generation
- [ ] Add login form component
- [ ] Write integration tests

## Fix pagination on list view #bug priority:medium est:2h
Items disappear when navigating past page 3.

# In Progress

# Review

# Done
`,
  },
  {
    id: 'bug-tracker',
    name: 'Bug Tracker',
    description: 'Issue tracking with severity and triage',
    icon: 'bug',
    itemType: 'board',
    markdown: `---
vocabulary:
  severity:
    - critical
    - major
    - minor
  component: []
---

# Triage

## New bug report template #minor
Describe what happened, expected behavior, and steps to reproduce.

> Bug is reproducible with clear steps
> Severity and component are assigned

# Investigating

# Fix In Progress

# Verified
`,
  },
  {
    id: 'sales-pipeline',
    name: 'Sales Pipeline',
    description: 'CRM-style deal tracking',
    icon: 'trending-up',
    itemType: 'board',
    markdown: `---
vocabulary:
  source:
    - inbound
    - outbound
    - referral
  size:
    - enterprise
    - mid-market
    - smb
---

# Prospecting

## Acme Corp #outbound #enterprise
Initial outreach sent. Decision maker identified.

### Learnings
- Enterprise deals need executive sponsor early #sales-process

# Qualifying

# Proposal

# Closing

# Won
`,
  },
  {
    id: 'content-calendar',
    name: 'Content Calendar',
    description: 'Content planning and publishing pipeline',
    icon: 'calendar',
    itemType: 'board',
    markdown: `---
vocabulary:
  type:
    - blog
    - social
    - video
    - newsletter
  audience: []
---

# Ideas

## Getting started guide #blog
Beginner-friendly tutorial for new users.

> Draft covers all setup steps
> Includes screenshots and code examples

# Writing

# Review

# Published
`,
  },
  {
    id: 'retrospective',
    name: 'Retrospective',
    description: 'Sprint retro with learnings',
    icon: 'message-circle',
    itemType: 'board',
    markdown: `# Went Well

## Fast iteration on UI changes
Team shipped 3 features in one sprint.

### Learnings
- Small PRs get reviewed faster #process
- Pair programming on complex features reduces bugs #collaboration

# Could Improve

## Test coverage gaps
Several bugs slipped through to production.

# Action Items

## [ ] Add CI test coverage threshold est:2h
Block merges below 80% coverage.
`,
  },
  {
    id: 'goals-okrs',
    name: 'Goals & OKRs',
    description: 'Quarterly goal tracking',
    icon: 'target',
    itemType: 'board',
    markdown: `---
vocabulary:
  type:
    - objective
    - key-result
  area: []
---

# Q1

## Launch v1.0 #objective priority:high
Ship the first production release.

> All critical features implemented
> Performance benchmarks met
> Documentation complete

## [ ] Reach 100 active users #key-result est:40h

## [ ] Zero critical bugs in production #key-result

# Q2

# Q3

# Q4
`,
  },
  {
    id: 'kanban',
    name: 'Kanban',
    description: 'Standard kanban board',
    icon: 'layout-grid',
    itemType: 'board',
    markdown: `# To Do

## First task

# In Progress

# Done
`,
  },
  {
    id: 'personal-tasks',
    name: 'Personal Tasks',
    description: 'Simple personal TODO',
    icon: 'user',
    itemType: 'board',
    markdown: `# Today

## Morning routine

# This Week

# Someday
`,
  },
  {
    id: 'blank',
    name: 'Blank Board',
    description: 'Empty board with one column',
    icon: 'file',
    itemType: 'board',
    markdown: `# Tasks
`,
  },

  // ─── Checklist Templates ────────────────────────────────────────────
  {
    id: 'checklist',
    name: 'Checklist',
    description: 'Simple checklist for tracking items',
    icon: 'check-square',
    itemType: 'checklist',
    markdown: `# Tasks

## [ ] First item

## [ ] Second item

## [ ] Third item
`,
  },

  // ─── Page Templates ─────────────────────────────────────────────────
  {
    id: 'page',
    name: 'Page',
    description: 'Free-form document for knowledge, specs, and documentation',
    icon: 'file-text',
    itemType: 'page',
    markdown: `# Untitled

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
`,
  },
]
