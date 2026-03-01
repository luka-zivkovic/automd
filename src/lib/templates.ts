import type { ItemType } from '@/lib/markdown/types'

export interface BoardTemplate {
  id: string
  name: string
  description: string
  icon: string
  markdown: string
}

export const ITEM_TYPE_DEFAULTS: Record<ItemType, { name: string; markdown: string }> = {
  board: {
    name: 'Untitled Board',
    markdown: '# To Do\n\n# In Progress\n\n# Done\n',
  },
  checklist: {
    name: 'Untitled Checklist',
    markdown: '# Tasks\n\n',
  },
  note: {
    name: 'Untitled Note',
    markdown: '',
  },
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'kanban',
    name: 'Kanban',
    description: 'Standard kanban board',
    icon: 'layout-grid',
    markdown: `# To Do

## First task

# In Progress

# Done
`,
  },
  {
    id: 'sprint',
    name: 'Sprint',
    description: 'Agile sprint board',
    icon: 'zap',
    markdown: `# Sprint Backlog

## User story 1

## User story 2

# In Development

# Code Review

# Testing

# Done
`,
  },
  {
    id: 'project-tracker',
    name: 'Project Tracker',
    description: 'Project management with phases',
    icon: 'folder-kanban',
    markdown: `# Planning

## Define requirements

## Create project timeline

## Assign team roles

# Design

# Development

# Testing

# Launch
`,
  },
  {
    id: 'personal-tasks',
    name: 'Personal Tasks',
    description: 'Simple personal TODO',
    icon: 'user',
    markdown: `# Today

## Morning routine

# This Week

# Someday
`,
  },
  {
    id: 'crm-pipeline',
    name: 'CRM Pipeline',
    description: 'Sales pipeline with deal stages',
    icon: 'funnel',
    markdown: `---
vocabulary:
  item_label: Deal
  groups:
    stage:
      options: [prospect, qualified, demo, proposal, negotiation, closed-won, closed-lost]
      style: pipeline
    source:
      options: [inbound, outbound, referral, partner]
      style: badge
  views: [kanban, checklist]
  hide_completion: true
---

# Prospect

## Example Lead #stage-prospect #source-inbound

First touchpoint made. Need to qualify budget and timeline.

> Decision maker identified
> Budget range confirmed

# Qualified

# Demo

# Proposal

# Negotiation

# Closed
`,
  },
  {
    id: 'content-calendar',
    name: 'Content Calendar',
    description: 'Blog & content planning',
    icon: 'calendar-days',
    markdown: `---
vocabulary:
  item_label: Post
  groups:
    status:
      options: [idea, draft, review, scheduled, published]
      style: pipeline
    category:
      options: [tutorial, announcement, case-study, thought-leadership]
      style: badge
  views: [kanban, checklist, editor]
---

# Ideas

## Getting Started Guide #status-idea #category-tutorial

Introductory guide for new users.

# Drafting

# Review

# Scheduled

# Published
`,
  },
  {
    id: 'knowledge-base',
    name: 'Knowledge Base',
    description: 'Team knowledge & decisions',
    icon: 'brain',
    markdown: `---
vocabulary:
  item_label: Note
  groups:
    type:
      options: [decision, pattern, reference, learning]
      style: badge
  views: [checklist, editor, memory]
  hide_completion: true
---

# Architecture

## Example Decision #type-decision knowledge:true

Document key architectural decisions here.

# Processes

# References
`,
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'Empty board with one column',
    icon: 'file',
    markdown: `# Tasks
`,
  },
]
