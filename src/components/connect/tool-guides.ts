// ─── Use Cases ───────────────────────────────────────────────────────

export type UseCase = 'task-manager' | 'knowledge-base' | 'team' | 'all-in-one'

export interface UseCaseOption {
  id: UseCase
  name: string
  description: string
}

export const USE_CASES: UseCaseOption[] = [
  { id: 'task-manager', name: 'Task Manager', description: 'Sprint boards, kanban, task tracking' },
  { id: 'knowledge-base', name: 'Knowledge Base', description: 'Decisions, patterns, learnings' },
  { id: 'team', name: 'Team', description: 'Shared KB, coordination, attribution' },
  { id: 'all-in-one', name: 'All-in-One', description: 'Tasks + knowledge together' },
]

// ─── Tool Guides ─────────────────────────────────────────────────────

export interface ToolGuide {
  id: string
  name: string
  icon: string // lucide icon name
  hasMcp: boolean
  mcpConfig?: string // JSON template with {{SERVER_URL}}, {{API_KEY}}
  promptFilePath?: string // where system prompt goes
  setupSteps: { title: string; description: string; code?: string }[]
  testInstruction: string
}

export const TOOL_GUIDES: ToolGuide[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    icon: 'Terminal',
    hasMcp: true,
    promptFilePath: 'CLAUDE.md',
    mcpConfig: `{
  "mcpServers": {
    "automd": {
      "command": "npx",
      "args": ["-y", "automd-mcp@latest"],
      "env": {
        "AUTOMD_SERVER_URL": "{{SERVER_URL}}",
        "AUTOMD_API_KEY": "{{API_KEY}}"
      }
    }
  }
}`,
    setupSteps: [
      {
        title: 'Add MCP server',
        description: 'Add this to your project\'s .mcp.json file (or create one in your project root):',
      },
      {
        title: 'Add to your system prompt',
        description: 'Paste this into your project\'s CLAUDE.md file so Claude automatically uses AutoMD:',
      },
      {
        title: 'Test it',
        description: 'Open Claude Code and try asking:',
        code: '"List my boards in AutoMD"',
      },
    ],
    testInstruction: 'Ask Claude Code to "list my boards in AutoMD"',
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    icon: 'Monitor',
    hasMcp: true,
    promptFilePath: 'Claude Desktop settings → Custom Instructions',
    mcpConfig: `{
  "mcpServers": {
    "automd": {
      "command": "npx",
      "args": ["-y", "automd-mcp@latest"],
      "env": {
        "AUTOMD_SERVER_URL": "{{SERVER_URL}}",
        "AUTOMD_API_KEY": "{{API_KEY}}"
      }
    }
  }
}`,
    setupSteps: [
      {
        title: 'Add MCP server config',
        description: 'Open Claude Desktop → Settings → Developer → Edit Config, and add this to your claude_desktop_config.json:',
      },
      {
        title: 'Add to Custom Instructions',
        description: 'Open Claude Desktop → Settings → Custom Instructions, and paste the system prompt below.',
      },
      {
        title: 'Restart & test',
        description: 'Restart Claude Desktop, then try:',
        code: '"List my boards in AutoMD"',
      },
    ],
    testInstruction: 'Ask Claude to "list my boards in AutoMD"',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: 'MousePointer',
    hasMcp: true,
    promptFilePath: '.cursor/rules',
    mcpConfig: `{
  "mcpServers": {
    "automd": {
      "command": "npx",
      "args": ["-y", "automd-mcp@latest"],
      "env": {
        "AUTOMD_SERVER_URL": "{{SERVER_URL}}",
        "AUTOMD_API_KEY": "{{API_KEY}}"
      }
    }
  }
}`,
    setupSteps: [
      {
        title: 'Add MCP server',
        description: 'Create or edit .cursor/mcp.json in your project root:',
      },
      {
        title: 'Add to your rules',
        description: 'Paste the system prompt below into your .cursor/rules file:',
      },
      {
        title: 'Test it',
        description: 'Open Cursor and try asking:',
        code: '"List my boards in AutoMD"',
      },
    ],
    testInstruction: 'Ask Cursor to "list my boards in AutoMD"',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    icon: 'Wind',
    hasMcp: true,
    promptFilePath: '.windsurfrules',
    mcpConfig: `{
  "mcpServers": {
    "automd": {
      "command": "npx",
      "args": ["-y", "automd-mcp@latest"],
      "env": {
        "AUTOMD_SERVER_URL": "{{SERVER_URL}}",
        "AUTOMD_API_KEY": "{{API_KEY}}"
      }
    }
  }
}`,
    setupSteps: [
      {
        title: 'Add MCP server',
        description: 'Open Windsurf → Settings → MCP, and add this config:',
      },
      {
        title: 'Add to your rules',
        description: 'Paste the system prompt below into your .windsurfrules file:',
      },
      {
        title: 'Test it',
        description: 'Open Windsurf and try asking:',
        code: '"List my boards in AutoMD"',
      },
    ],
    testInstruction: 'Ask Windsurf to "list my boards in AutoMD"',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: 'MessageSquare',
    hasMcp: false,
    promptFilePath: 'ChatGPT → Settings → Personalization → Custom Instructions',
    setupSteps: [
      {
        title: 'Copy your context endpoint',
        description: 'Use this URL to fetch your latest boards and knowledge as context:',
      },
      {
        title: 'Add Custom Instructions',
        description: 'Go to ChatGPT → Settings → Personalization → Custom Instructions, and paste the system prompt below.',
      },
      {
        title: 'Use it',
        description: 'Before starting a conversation, use the "Copy as context" button in AutoMD\'s Memory view to paste your current context into ChatGPT.',
      },
    ],
    testInstruction: 'Paste your board context and ask ChatGPT to summarize your tasks',
  },
  {
    id: 'other',
    name: 'Other / API',
    icon: 'Code',
    hasMcp: false,
    promptFilePath: 'Your tool\'s system prompt / instructions',
    setupSteps: [
      {
        title: 'REST API',
        description: 'Use the AutoMD REST API to read and write boards programmatically:',
      },
      {
        title: 'Add system prompt',
        description: 'Add the system prompt below to your AI tool\'s instructions or system message.',
      },
      {
        title: 'Test it',
        description: 'Try fetching your boards:',
      },
    ],
    testInstruction: 'Call the API to list your boards',
  },
]

// ─── System Prompts ──────────────────────────────────────────────────

/** MCP prompts (for tools that support MCP: Claude Code, Desktop, Cursor, Windsurf) */
const MCP_PROMPTS: Record<UseCase, string> = {
  'task-manager': `## AutoMD — Task Management

You have access to AutoMD at {{SERVER_URL}}, your task management system.

**Before starting work:**
- Use \`list_boards\` and \`get_board\` to see current tasks and priorities
- Check what's in progress, blocked, or overdue

**While working:**
- Update task status as you progress (\`toggle_task\`, \`move_task\`)
- Add subtasks to break down complex work (\`add_subtask\`)
- Log blockers or decisions in task descriptions

**After completing work:**
- Mark tasks done and move them to the Done column
- Add new tasks for follow-up work discovered during implementation
- Use \`update_learnings\` to capture what you learned for future reference

**Quality over quantity:**
- Only create tasks for concrete, actionable work — not vague ideas
- Update existing tasks instead of creating duplicates
- Keep learnings concise and specific — one insight per bullet
- Don't create subtasks for trivial steps that don't need tracking`,

  'knowledge-base': `## AutoMD — Knowledge Tracking

You have access to AutoMD at {{SERVER_URL}}, your knowledge base.

**Before starting any task:**
- Use \`find_knowledge\` to check what's already known about the topic
- Use \`synthesize_topic\` to assemble context briefs for complex topics
- Review existing decisions before making new ones

**While working:**
- Reference existing knowledge when making decisions
- Note when you discover something that contradicts or extends existing knowledge

**After completing work:**
- Use \`add_knowledge\` to record decisions, patterns, and references (\`knowledge:true\`)
- Use \`update_learnings\` to capture insights with #tags for retrieval
- Document the "why" behind decisions, not just the "what"

**Quality over quantity:**
- Only record knowledge that would be useful in future sessions
- Update existing knowledge items when information changes — don't create duplicates
- Each knowledge item should be self-contained and searchable
- Skip trivial or obvious information that doesn't need to be preserved
- Use specific #tags, not generic ones — #react-query-caching not #caching

This builds institutional memory that compounds over time.`,

  'team': `## AutoMD — Team Knowledge Hub

You have access to AutoMD at {{SERVER_URL}}, your team's shared knowledge and task system.

**Before starting any task:**
- Use \`find_knowledge\` to check what the team already knows about this topic
- Use \`list_boards\` to see what others are working on — avoid duplicate effort
- Check for existing tasks assigned to others that relate to your work

**While working:**
- Attribute your work: always include \`built-by:{{USERNAME}}\` when creating or completing tasks
- Update task status so the team can see progress (\`toggle_task\`, \`move_task\`)
- Log decisions in task descriptions so teammates understand the "why"

**After completing work:**
- Use \`add_knowledge\` to record decisions and patterns for the whole team
- Use \`update_learnings\` with descriptive #tags so others can find your insights
- If your work affects others' tasks, update those tasks with relevant context

**Coordination:**
- Check \`@assignee\` metadata before picking up unassigned work
- When you find knowledge gaps, create a knowledge item even if you can't fill it yet
- Cross-reference related tasks and knowledge items when relevant

**Quality over quantity:**
- Only record knowledge that would help a teammate in a future session
- Update existing items instead of creating duplicates — search first
- Keep learnings specific and actionable, not generic observations
- One well-documented decision is worth ten vague notes`,

  'all-in-one': `## AutoMD — Knowledge & Task Tracking

You have access to AutoMD at {{SERVER_URL}}, a knowledge-first task management system.

**Before starting any task:**
- Use \`find_knowledge\` to check what's already known about the topic
- Review relevant boards with \`list_boards\` and \`get_board\`

**While working:**
- Update task status as you progress (\`toggle_task\`, \`move_task\`)
- Log decisions and context in task descriptions

**After completing work:**
- Use \`update_learnings\` to capture what you learned
- Use \`add_knowledge\` for reusable patterns, decisions, or references
- Tag learnings with #labels for easy retrieval

**Quality over quantity:**
- Only log learnings worth remembering in future sessions
- Update existing items instead of creating duplicates
- Keep entries concise and specific — searchable, not exhaustive

This builds institutional memory that helps you and future sessions work smarter.`,
}

/** REST prompts (for tools without MCP: ChatGPT, Other) */
const REST_PROMPTS: Record<UseCase, string> = {
  'task-manager': `I'll paste my current board from AutoMD ({{SERVER_URL}}).

Help me prioritize, break down tasks, and plan next steps. After work, remind me to update task status in AutoMD.

Focus on concrete, actionable items only. Don't suggest creating tasks for trivial things.`,

  'knowledge-base': `I'll paste context from my AutoMD knowledge base ({{SERVER_URL}}).

Help me analyze topics, make decisions, and draft knowledge entries to save back. After work, remind me to log learnings.

Only suggest recording insights worth preserving in future sessions. Quality over quantity.`,

  'team': `I'll paste context from our team's AutoMD ({{SERVER_URL}}).

Help coordinate work, avoid duplicating effort, and draft knowledge entries that help the whole team. Always attribute decisions and discoveries.

Focus on what would help a teammate in a future session — skip obvious or generic observations.`,

  'all-in-one': `I'll paste context from AutoMD ({{SERVER_URL}}).

Before work: help me review what's already known. After work: remind me to log learnings and update tasks back in AutoMD.

Quality over quantity — only suggest logging what's genuinely worth remembering.`,
}

/**
 * Returns the appropriate system prompt for a given use case + tool combination.
 * Replaces {{SERVER_URL}}, {{API_KEY}}, and {{USERNAME}} placeholders.
 */
export function getSystemPrompt(
  useCase: UseCase,
  hasMcp: boolean,
  replacements: { serverUrl: string; apiKey?: string; username?: string },
): string {
  const template = hasMcp ? MCP_PROMPTS[useCase] : REST_PROMPTS[useCase]
  return template
    .replace(/\{\{SERVER_URL\}\}/g, replacements.serverUrl)
    .replace(/\{\{API_KEY\}\}/g, replacements.apiKey || 'YOUR_API_KEY')
    .replace(/\{\{USERNAME\}\}/g, replacements.username || 'your-name')
}

/**
 * Returns the MCP config JSON with placeholders replaced.
 */
export function getMcpConfig(
  tool: ToolGuide,
  replacements: { serverUrl: string; apiKey?: string },
): string {
  if (!tool.mcpConfig) return ''
  return tool.mcpConfig
    .replace(/\{\{SERVER_URL\}\}/g, replacements.serverUrl)
    .replace(/\{\{API_KEY\}\}/g, replacements.apiKey || 'YOUR_API_KEY')
}

/**
 * Returns the REST API example for non-MCP tools.
 */
export function getRestApiExample(replacements: { serverUrl: string; apiKey?: string }): string {
  const key = replacements.apiKey || 'YOUR_API_KEY'
  return `# List all boards
curl -H "Authorization: Bearer ${key}" \\
  ${replacements.serverUrl}/api/files

# Get a specific board
curl -H "Authorization: Bearer ${key}" \\
  ${replacements.serverUrl}/api/files/BOARD_ID

# Search context (for knowledge retrieval)
curl -H "Authorization: Bearer ${key}" \\
  "${replacements.serverUrl}/api/context?q=YOUR_SEARCH_TERM"`
}
