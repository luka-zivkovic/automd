export interface BoardTemplate {
  id: string
  name: string
  description: string
  icon: string
  markdown: string
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'kanban',
    name: 'Kanban',
    description: 'Standard kanban board',
    icon: 'layout-grid',
    markdown: `# Kanban Board

## To Do

- [ ] First task

## In Progress

## Done
`,
  },
  {
    id: 'sprint',
    name: 'Sprint',
    description: 'Agile sprint board',
    icon: 'zap',
    markdown: `# Sprint Board

## Sprint Backlog

- [ ] User story 1
- [ ] User story 2

## In Development

## Code Review

## Testing

## Done
`,
  },
  {
    id: 'project-tracker',
    name: 'Project Tracker',
    description: 'Project management with phases',
    icon: 'folder-kanban',
    markdown: `# Project Tracker

## Planning

- [ ] Define requirements
- [ ] Create project timeline
- [ ] Assign team roles

## Design

## Development

## Testing

## Launch
`,
  },
  {
    id: 'personal-tasks',
    name: 'Personal Tasks',
    description: 'Simple personal TODO',
    icon: 'user',
    markdown: `# My Tasks

## Today

- [ ] Morning routine

## This Week

## Someday
`,
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'Empty board with one section',
    icon: 'file',
    markdown: `# New Board

## Tasks
`,
  },
]
