export interface PlaceholderDef {
  token: string
  type: 'board' | 'input'
  label: string
  multiline?: boolean
}

export interface PromptDefinition {
  id: string
  name: string
  description: string
  category: 'system' | 'workflow' | 'planning' | 'operations'
  prompt: string
  placeholders: PlaceholderDef[]
}

export const PROMPT_CATALOG: PromptDefinition[] = [
  // ─── System ──────────────────────────────────────────────────────
  {
    id: 'automd_system_instructions',
    name: 'System Instructions',
    description: 'Teach your AI assistant how AutoMD works — the markdown format, available tools, and best practices',
    category: 'system',
    placeholders: [],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

Before doing anything, learn how AutoMD works:

Markdown Format:
- Each board is a markdown file with YAML frontmatter (board name, description, tags)
- # H1 headings = columns (e.g., "# Backlog", "# In Progress", "# Done")
- ## H2 headings = tasks (optionally prefixed with [ ] or [x] for checklist boards)
- Plain paragraphs under a task = description (context, background, "why")
- > Blockquotes = acceptance criteria (testable definition of done)
- - [ ] Checkbox items = subtasks
- ### Learnings = discovered knowledge, tagged with #hashtags

Inline Metadata Tokens (placed on the ## task heading line):
@assignee, #label, priority:high/medium/low, due:YYYY-MM-DD, est:Xh, built-by:agent, completed-at:YYYY-MM-DD

Available MCP Tools:
- Reading: list_boards, get_board, get_task
- Searching: search_context (searches descriptions, AC, learnings — not just titles)
- Writing: create_board, add_task, update_task, move_task, update_acceptance_criteria, update_learnings, add_subtask, toggle_subtask
- Knowledge: add_knowledge, update_knowledge, find_knowledge, synthesize_topic, import_memories
- Metadata: update_task_metadata (set priority, labels, estimates, assignees)
- Lifecycle: move_task_to_board (active ↔ archive/backlog)
- Cleanup: archive_completed_tasks, delete_task

Best Practices:
- Always identify yourself with agentName when creating/updating tasks
- Use search_context before creating tasks to find related work and avoid duplicates
- Write testable acceptance criteria — someone should be able to verify pass/fail
- Record learnings on completed tasks — what worked, what didn't, decisions made
- Use #labels consistently across boards for cross-referencing`,
  },

  // ─── Workflow ────────────────────────────────────────────────────
  {
    id: 'decompose_task',
    name: 'Decompose Task',
    description: 'Break a feature or epic into structured, implementable tasks',
    category: 'workflow',
    placeholders: [
      { token: 'BOARD NAME', type: 'board', label: 'Board' },
      { token: 'FEATURE DESCRIPTION', type: 'input', label: 'Feature description' },
    ],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want you to decompose a feature into tasks on my [BOARD NAME] board.

Feature to decompose:
[FEATURE DESCRIPTION]

Steps:
1. Use list_boards to find the board, then get_board to read its current state
2. Use search_context to find related existing work, past learnings, and potential overlaps
3. Break the feature into 3-8 discrete tasks, each completable in 1-8 hours
4. For each task, create it with add_task including:
   - A descriptive title with #labels, priority level, and est:Xh
   - A description paragraph explaining context and "why"
   - 2-5 testable acceptance criteria (via update_acceptance_criteria)
   - Subtasks if the task has clear sub-steps (via add_subtask)
5. Consider task ordering — note dependencies in descriptions
6. Provide a summary with suggested implementation order

Guidelines:
- Each task should be independently completable
- Use consistent #labels for the feature across all tasks
- If a task would take >8h, decompose it further
- Check existing tasks to avoid duplicates`,
  },
  {
    id: 'write_acceptance_criteria',
    name: 'Write Acceptance Criteria',
    description: 'Scan tasks and generate testable acceptance criteria for those missing them',
    category: 'workflow',
    placeholders: [{ token: 'BOARD NAME', type: 'board', label: 'Board' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want you to write acceptance criteria for tasks on my [BOARD NAME] board.

Steps:
1. Use list_boards to find the board, then get_board to read all tasks
2. Identify tasks with missing or weak acceptance criteria — prioritize active columns
3. Use search_context to find related tasks' AC for consistency
4. For each task needing AC, call update_acceptance_criteria with well-written criteria
5. Summarize what was updated

Good AC guidelines:
- Each criterion is testable — someone can verify pass/fail
- Written from the user's perspective ("User can...", "System displays...")
- Specific — no vague terms like "fast", "good", "properly"
- Covers edge cases: empty input, errors, permissions
- 2-6 criteria per task (more suggests the task needs decomposition)`,
  },
  {
    id: 'kickoff_board',
    name: 'Kickoff Board',
    description: 'Scaffold a new project board with columns, initial tasks, and estimates',
    category: 'workflow',
    placeholders: [{ token: 'PROJECT DESCRIPTION', type: 'input', label: 'Project description' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want you to create a new board for this project:
[PROJECT DESCRIPTION]

Steps:
1. Use search_context to check for related existing work and learnings
2. Generate a concise board name from the project description
3. Create the board with create_board including:
   - YAML frontmatter with board name, description, and relevant tags
   - Columns: Backlog, To Do, In Progress, Review, Done
   - 5-10 initial tasks covering the obvious first steps
4. Each task should have:
   - Descriptive title with #labels and priority levels
   - A description paragraph explaining context
   - Acceptance criteria (via update_acceptance_criteria after creation)
   - Estimated effort (est:Xh)
5. Suggest which task to pick up first

Provide the full markdown in a single create_board call, then add AC for each task.`,
  },
  {
    id: 'find_knowledge',
    name: 'Find Knowledge',
    description: 'Search past learnings and decisions across all boards',
    category: 'workflow',
    placeholders: [{ token: 'TOPIC', type: 'input', label: 'Topic' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want you to find everything the team knows about: [TOPIC]

Steps:
1. Use search_context with the topic and related keywords/synonyms
2. Look through results for learnings, decisions, AC patterns, and open questions
3. Synthesize into a structured knowledge brief:
   - Summary (2-3 sentences)
   - Key Decisions — what approaches were chosen and why
   - Lessons Learned — what to do and what to avoid
   - Relevant Tasks — board + task references for deeper context
   - Knowledge Gaps — what should be documented but isn't

If no results found, say so clearly and suggest what to document going forward.`,
  },
  {
    id: 'import_memories',
    name: 'Import Memories',
    description: 'Import knowledge from other AI platforms (Claude, ChatGPT, Cursor) into AutoMD',
    category: 'workflow',
    placeholders: [
      { token: 'SOURCE PLATFORM', type: 'input', label: 'Source platform (e.g. Claude, ChatGPT, Cursor)' },
      { token: 'PASTE MEMORIES HERE', type: 'input', label: 'Paste memories', multiline: true },
    ],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want to import my memories/knowledge from [SOURCE PLATFORM] into AutoMD.

Here are my memories:
[PASTE MEMORIES HERE]

Steps:
1. Use list_boards to check if a Knowledge board exists, or create one with create_board
2. Call import_memories with the raw text, source platform name, and target board
3. Review the imported entries and enhance the most important ones:
   - Add specific #tags using update_knowledge
   - Expand terse entries with better descriptions
   - Group related memories under consistent tags
4. Provide a summary: how many entries imported, key themes, and suggestions for organizing further`,
  },
  {
    id: 'synthesize_knowledge',
    name: 'Synthesize Knowledge',
    description: 'Create a comprehensive knowledge brief about a topic from all boards',
    category: 'workflow',
    placeholders: [{ token: 'TOPIC', type: 'input', label: 'Topic' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want a comprehensive knowledge brief about: [TOPIC]

Steps:
1. Call synthesize_topic with the topic to aggregate all related knowledge
2. Call find_knowledge with the topic and related keywords for additional context
3. Organize findings into:
   - Executive Summary (2-3 sentences)
   - Key Knowledge — direct knowledge notes
   - Learnings from Tasks — practical insights
   - Decisions Made — approaches chosen and rationale
   - Knowledge Gaps — what's missing
4. Rate overall coverage: Comprehensive / Adequate / Sparse / Missing
5. Suggest specific knowledge entries to create if gaps exist`,
  },

  // ─── Planning ────────────────────────────────────────────────────
  {
    id: 'sprint_planning',
    name: 'Sprint Planning',
    description: 'Analyze backlog and plan the next sprint based on priority and capacity',
    category: 'planning',
    placeholders: [{ token: 'BOARD NAME', type: 'board', label: 'Board' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want you to help plan the next sprint for my [BOARD NAME] board.

Steps:
1. Use list_boards to find the board, then get_board to read its current state
2. Identify tasks in the backlog that should be pulled into the sprint
3. Prioritize by: priority labels, due dates, and dependencies
4. Suggest task assignments based on current workload distribution
5. Calculate total effort from est:Xh estimates — flag tasks missing estimates
6. Identify blockers or dependencies that should be resolved first
7. Recommend a realistic sprint scope

For each recommendation, provide the specific move_task and update_task_metadata tool calls I can approve.

Output a clear sprint plan with: selected tasks, total estimated hours, risks, and suggested order.`,
  },
  {
    id: 'estimate_tasks',
    name: 'Estimate Tasks',
    description: 'Add calibrated time estimates to unestimated tasks',
    category: 'planning',
    placeholders: [{ token: 'BOARD NAME', type: 'board', label: 'Board' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want you to estimate unestimated tasks on my [BOARD NAME] board.

Steps:
1. Use list_boards to find the board, then get_board to read all tasks
2. Find tasks missing the est:Xh estimate
3. Examine completed tasks WITH estimates for calibration — were they accurate?
4. Use search_context to find similar completed tasks on other boards
5. For each unestimated task, consider:
   - Description complexity, AC count, subtask count
   - Comparison to similar completed tasks
   - Uncertainty factor — vague AC or thin description = estimate higher
6. Apply estimates using update_task_metadata

Use these increments: 0.5h, 1h, 2h, 4h, 8h, 16h.
Tasks >16h should be flagged for decomposition.

Provide a summary: total estimated hours, high-uncertainty tasks, and comparison to completed task averages.`,
  },
  {
    id: 'dependency_analysis',
    name: 'Dependency Analysis',
    description: 'Map task dependencies and find the critical path',
    category: 'planning',
    placeholders: [{ token: 'BOARD NAME', type: 'board', label: 'Board' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want you to analyze dependencies on my [BOARD NAME] board.

Steps:
1. Use list_boards to find the board, then get_board to read all tasks
2. Determine dependencies by examining:
   - Explicit mentions of other tasks in descriptions
   - Shared #labels implying ordering (#api before #frontend)
   - AC that references functionality from other tasks
   - Common ordering patterns (data model → API → UI)
3. Build a dependency map:
   - Independent tasks (can start immediately)
   - Dependency chains (A depends on B)
   - Blocking tasks (high priority to unblock others)
   - Critical path (longest dependency chain)
4. Recommend an execution order with parallel lanes where possible
5. Flag risks: active tasks depending on incomplete backlog items
6. Suggest reordering via move_task to reflect dependency order`,
  },

  // ─── Operations ──────────────────────────────────────────────────
  {
    id: 'triage_tasks',
    name: 'Triage Tasks',
    description: 'Review and organize uncategorized or misplaced tasks',
    category: 'operations',
    placeholders: [{ token: 'BOARD NAME', type: 'board', label: 'Board' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

I want you to triage tasks on my [BOARD NAME] board.

Steps:
1. Use list_boards to find the board, then get_board to read all tasks
2. Check for:
   - Tasks in the wrong column (e.g., completed tasks still in "In Progress")
   - Tasks missing priority levels that should have them
   - Tasks missing assignees in active columns
   - Potential duplicates or tasks that could be merged
   - Opportunities to improve column organization
3. For each suggestion, explain your reasoning
4. Provide the specific tool calls (move_task, update_task_metadata, delete_task) I can approve

Don't make changes — just list recommendations for my review.`,
  },
  {
    id: 'daily_standup',
    name: 'Daily Standup',
    description: 'Generate a concise standup summary from the current board state',
    category: 'operations',
    placeholders: [{ token: 'BOARD NAME', type: 'board', label: 'Board' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

Generate a daily standup report for my [BOARD NAME] board.

Steps:
1. Use list_boards to find the board, then get_board to read its current state
2. Produce a concise report covering:
   - Completed: Tasks that are checked/done (especially recently)
   - In Progress: Active tasks in non-backlog columns
   - Blocked/At Risk: Overdue tasks, high priority but unassigned, or stalled items
   - Key Metrics: Total tasks, completion rate, overdue count

Format for a quick team sync — scannable, bullet-pointed, most important items first.`,
  },
  {
    id: 'retrospective',
    name: 'Retrospective',
    description: 'Run a retrospective on completed work and generate action items',
    category: 'operations',
    placeholders: [{ token: 'BOARD NAME', type: 'board', label: 'Board' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

Run a retrospective on my [BOARD NAME] board for the last 2 weeks.

Steps:
1. Use list_boards to find the board, then get_board to read all tasks
2. Analyze completed tasks, especially those with learnings:
   - What went well — on-time tasks, positive learnings, good AC
   - What could improve — overdue tasks, missing estimates, unexpected complexity
   - Estimate accuracy — compare est:Xh vs actual from learnings
   - Knowledge gaps — tasks that suggest expertise gaps
   - Patterns — recurring themes across completed tasks
3. Produce a structured retrospective:
   - Summary with key metrics
   - "Keep doing" items (3-5)
   - "Change" items (3-5) with specific suggestions
   - Action items — concrete improvement tasks
4. Offer to create action items on the board using add_task with AC`,
  },
  {
    id: 'board_cleanup',
    name: 'Board Cleanup',
    description: 'Audit board hygiene — stale tasks, missing metadata, inconsistencies',
    category: 'operations',
    placeholders: [{ token: 'BOARD NAME', type: 'board', label: 'Board' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

Audit the hygiene of my [BOARD NAME] board.

Steps:
1. Use list_boards to find the board, then get_board to read all tasks
2. Check for these issues:
   - Stale tasks — past-due in active columns with no activity
   - Missing metadata — no priority, estimates, or labels
   - Completed but not moved — checked tasks in non-Done columns
   - Overdue tasks — past due date and not done
   - Missing acceptance criteria — active tasks without AC
   - Large tasks — >8h estimate or >5 subtasks (should decompose)
   - Inconsistent labels — similar labels to unify (#frontend vs #front-end)
   - Orphaned tasks — no description, no AC, vague titles
   - Old completed tasks — done >30 days ago, should be archived
3. For each issue, report:
   - What the problem is
   - Severity: low / medium / high
   - Suggested fix with specific tool call

List all issues for my review — don't apply changes automatically.`,
  },
  {
    id: 'handoff_summary',
    name: 'Handoff Summary',
    description: 'Generate a context-rich briefing document for team onboarding',
    category: 'operations',
    placeholders: [{ token: 'BOARD NAME', type: 'board', label: 'Board' }],
    prompt: `You have access to AutoMD, an AI-native task management platform, via MCP tools.

Generate a handoff briefing for my [BOARD NAME] board.

Steps:
1. Use list_boards to find the board, then get_board to read its full state
2. Use search_context to gather learnings and institutional knowledge
3. Produce a structured briefing:

   Project Status
   - Overall completion percentage, current phase
   - Key metrics: total tasks, in-progress, overdue

   Completed Work
   - Summary of done tasks and key learnings
   - Important decisions made and rationale

   In Progress
   - Active tasks with status and assignees
   - Blockers or risks

   What's Next
   - Prioritized upcoming tasks
   - Recommended starting point
   - Dependencies to watch

   Key Knowledge
   - Synthesized learnings from completed tasks
   - Important AC patterns and technical constraints

Format as a clear document readable in 5 minutes.`,
  },
]

export const PROMPT_CATEGORIES = {
  system: { label: 'System', description: 'Core instructions for AI assistants' },
  workflow: { label: 'Workflow', description: 'Task creation and knowledge management' },
  planning: { label: 'Planning', description: 'Sprint planning and estimation' },
  operations: { label: 'Operations', description: 'Board maintenance and reporting' },
} as const
