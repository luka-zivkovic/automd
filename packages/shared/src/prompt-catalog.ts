// ─── MCP Prompt Catalog ───────────────────────────────────────────────
// Mirrors server-registered prompts for UI discovery

export interface PromptDefinition {
  id: string
  name: string
  description: string
  category: 'workflow' | 'planning' | 'operations' | 'knowledge'
  requiredArgs: string[]
  optionalArgs?: string[]
}

export const MCP_PROMPTS: PromptDefinition[] = [
  // Workflow
  { id: 'automd_system_instructions', name: 'System Instructions', description: 'Comprehensive guide for AI agents on how to use AutoMD', category: 'workflow', requiredArgs: [] },
  { id: 'decompose_task', name: 'Decompose Task', description: 'Break down a complex task into subtasks with estimates', category: 'workflow', requiredArgs: ['boardId', 'taskId'] },
  { id: 'write_acceptance_criteria', name: 'Write Acceptance Criteria', description: 'Write testable acceptance criteria for a task', category: 'workflow', requiredArgs: ['boardId', 'taskId'] },
  { id: 'kickoff_board', name: 'Kickoff Board', description: 'Set up a new board for a project with initial structure', category: 'workflow', requiredArgs: ['projectName'], optionalArgs: ['context'] },
  // Knowledge
  { id: 'find_knowledge_prompt', name: 'Find Knowledge', description: 'Search and synthesize knowledge about a topic across all boards', category: 'knowledge', requiredArgs: ['topic'] },
  { id: 'import_memories_prompt', name: 'Import Memories', description: 'Guide for importing knowledge from external AI tools', category: 'knowledge', requiredArgs: [], optionalArgs: ['source'] },
  // Planning
  { id: 'sprint_planning', name: 'Sprint Planning', description: 'Plan next sprint from backlog with capacity constraints', category: 'planning', requiredArgs: ['boardId'], optionalArgs: ['sprintCapacityHours'] },
  { id: 'estimate_tasks', name: 'Estimate Tasks', description: 'Estimate effort for unestimated tasks', category: 'planning', requiredArgs: ['boardId'], optionalArgs: ['columnId'] },
  { id: 'dependency_analysis', name: 'Dependency Analysis', description: 'Analyze task dependencies and suggest execution order', category: 'planning', requiredArgs: ['boardId'] },
  // Operations
  { id: 'triage_tasks', name: 'Triage Tasks', description: 'Review uncategorized tasks and suggest improvements', category: 'operations', requiredArgs: ['boardId'] },
  { id: 'daily_standup', name: 'Daily Standup', description: 'Summarize progress: done, in progress, blocked', category: 'operations', requiredArgs: ['boardId'] },
  { id: 'retrospective', name: 'Retrospective', description: 'Run a retrospective and extract learnings', category: 'operations', requiredArgs: ['boardId'] },
  { id: 'board_cleanup', name: 'Board Cleanup', description: 'Clean up stale tasks, duplicates, and organizational issues', category: 'operations', requiredArgs: ['boardId'] },
  { id: 'handoff_summary', name: 'Handoff Summary', description: 'Generate a handoff briefing for work transitions', category: 'operations', requiredArgs: ['boardId'], optionalArgs: ['context'] },
]

// ─── Template Prompts ─────────────────────────────────────────────────
// Copyable starter prompts users paste into their AI conversations

export interface TemplatePromptPlaceholder {
  key: string
  description: string
  example: string
}

export interface TemplatePrompt {
  id: string
  name: string
  description: string
  category: 'getting-started' | 'knowledge' | 'planning' | 'operations'
  prompt: string
  placeholders: TemplatePromptPlaceholder[]
}

export const TEMPLATE_PROMPTS: TemplatePrompt[] = [
  // Getting Started
  {
    id: 'setup-knowledge-base',
    name: 'Set Up Knowledge Base',
    description: 'Create a knowledge base board for a domain',
    category: 'getting-started',
    prompt: `Create a knowledge base board in AutoMD for "{{domain}}".

Use create_board with vocabulary dimensions relevant to this domain. Add 3-5 initial knowledge items (knowledge:true) capturing the most important decisions and patterns. Include learnings with #tags for each.`,
    placeholders: [
      { key: 'domain', description: 'Your domain or area of expertise', example: 'React architecture' },
    ],
  },
  {
    id: 'import-memories',
    name: 'Import My Memories',
    description: 'Bulk import notes from another AI tool',
    category: 'getting-started',
    prompt: `Import my notes from {{source}} into AutoMD. I'll paste them below.

Parse each note into a knowledge item with a clear title, description, relevant labels, and extracted learnings. Use import_memories to bulk-create them. If no knowledge board exists, create one first.

Here are my notes:
{{notes}}`,
    placeholders: [
      { key: 'source', description: 'Where the notes are from', example: 'Claude conversations' },
      { key: 'notes', description: 'Paste your notes here', example: '(paste your notes)' },
    ],
  },
  {
    id: 'kickoff-project',
    name: 'Kickoff New Project',
    description: 'Create a project with sprint board and knowledge base',
    category: 'getting-started',
    prompt: `Create an AutoMD project for "{{name}}".

Set up:
1. A sprint board with columns: Backlog, In Progress, Review, Done
2. A knowledge base board for decisions and patterns
3. Vocabulary dimensions relevant to this project
4. 3-5 initial tasks to get started

Context: {{context}}`,
    placeholders: [
      { key: 'name', description: 'Project name', example: 'E-commerce MVP' },
      { key: 'context', description: 'Brief project description', example: 'Building a Next.js e-commerce app with Stripe' },
    ],
  },
  // Knowledge
  {
    id: 'capture-decision',
    name: 'Capture Decision',
    description: 'Record an architectural or business decision',
    category: 'knowledge',
    prompt: `Record this decision as a knowledge item in AutoMD:

Decision: {{decision}}
Context: {{context}}

Use add_knowledge with knowledge:true. Include:
- Why this decision was made
- Alternatives that were considered
- Learnings with relevant #tags`,
    placeholders: [
      { key: 'decision', description: 'The decision made', example: 'Use PostgreSQL instead of MongoDB' },
      { key: 'context', description: 'Context and reasoning', example: 'Need strong consistency for financial transactions' },
    ],
  },
  {
    id: 'synthesize-topic',
    name: 'Synthesize Topic',
    description: 'Gather everything known about a topic',
    category: 'knowledge',
    prompt: `Synthesize everything AutoMD knows about "{{topic}}".

Use find_knowledge and synthesize_topic to search across all boards. Provide:
1. Summary of what's known
2. Key decisions and reasoning
3. Patterns and best practices
4. Gaps in knowledge that should be documented`,
    placeholders: [
      { key: 'topic', description: 'Topic to research', example: 'authentication patterns' },
    ],
  },
  {
    id: 'review-organize',
    name: 'Review & Organize Knowledge',
    description: 'Audit knowledge base for quality and gaps',
    category: 'knowledge',
    prompt: `Review the knowledge base on board "{{board}}" in AutoMD.

Find:
1. Duplicate or overlapping knowledge items
2. Items that need better tags or categorization
3. Outdated information that should be updated
4. Gaps — important topics not yet documented

Suggest specific tool calls to fix each issue.`,
    placeholders: [
      { key: 'board', description: 'Board name to review', example: 'Architecture Decisions' },
    ],
  },
  // Planning
  {
    id: 'plan-sprint',
    name: 'Sprint Planning',
    description: 'Plan the next sprint from backlog',
    category: 'planning',
    prompt: `Help me plan the next sprint for "{{board}}" in AutoMD.

Capacity: {{capacity}} hours.

Review the backlog, prioritize tasks, check estimates, and recommend a realistic sprint scope. Move selected tasks to the sprint column.`,
    placeholders: [
      { key: 'board', description: 'Board to plan from', example: 'Product Sprint Board' },
      { key: 'capacity', description: 'Team capacity in hours', example: '40' },
    ],
  },
  {
    id: 'write-ac',
    name: 'Write Acceptance Criteria',
    description: 'Define done for a task',
    category: 'planning',
    prompt: `Write acceptance criteria for this task in AutoMD:

Task: {{task_description}}

Write clear, testable criteria using blockquote format (> each criterion). Each should have a clear pass/fail outcome. Use update_acceptance_criteria to save them.`,
    placeholders: [
      { key: 'task_description', description: 'What the task should accomplish', example: 'Add user profile page with avatar upload' },
    ],
  },
  {
    id: 'decompose',
    name: 'Decompose Task',
    description: 'Break a large task into subtasks',
    category: 'planning',
    prompt: `Break down this task into subtasks in AutoMD:

Task: {{task}}

Create 3-7 concrete subtasks with:
- Estimated hours for each
- Dependencies between them
- Which can be parallelized

Use add_subtask for each subtask.`,
    placeholders: [
      { key: 'task', description: 'Task to break down', example: 'Implement payment processing with Stripe' },
    ],
  },
  // Operations
  {
    id: 'triage',
    name: 'Triage Tasks',
    description: 'Review and organize uncategorized tasks',
    category: 'operations',
    prompt: `Triage tasks on "{{board}}" in AutoMD.

Review all tasks and suggest:
1. Priority assignments for unprioritized tasks
2. Tasks in wrong columns
3. Duplicates to merge
4. Missing estimates or assignees`,
    placeholders: [
      { key: 'board', description: 'Board to triage', example: 'Product Backlog' },
    ],
  },
  {
    id: 'standup',
    name: 'Daily Standup',
    description: 'Quick progress summary',
    category: 'operations',
    prompt: `Generate a daily standup summary for "{{board}}" in AutoMD.

Cover: completed, in progress, blocked, and key metrics. Keep it concise and actionable.`,
    placeholders: [
      { key: 'board', description: 'Board to summarize', example: 'Sprint Board' },
    ],
  },
  {
    id: 'retro',
    name: 'Retrospective',
    description: 'Review completed work and extract learnings',
    category: 'operations',
    prompt: `Run a retrospective on "{{board}}" in AutoMD.

Analyze: what went well, what could improve, action items. For each learning worth keeping, save it as a knowledge item with add_knowledge.`,
    placeholders: [
      { key: 'board', description: 'Board to retrospect on', example: 'Sprint 12 Board' },
    ],
  },
  {
    id: 'archive-cleanup',
    name: 'Archive & Cleanup',
    description: 'Archive old completed tasks',
    category: 'operations',
    prompt: `Clean up "{{board}}" in AutoMD.

Archive completed tasks older than {{days}} days. Also identify duplicates, stale tasks, and organizational improvements. Use archive_completed_tasks and specific tool calls for each fix.`,
    placeholders: [
      { key: 'board', description: 'Board to clean up', example: 'Development Board' },
      { key: 'days', description: 'Days threshold for archiving', example: '30' },
    ],
  },
]
