# AutoMD

Markdown-based task management with editor, checklist, and kanban views. Tasks are stored as plain markdown with inline metadata, enabling seamless collaboration between humans and AI agents.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│              React Frontend (Vite)                    │
│   Editor View  ·  Checklist View  ·  Kanban View     │
│                                                      │
│   Zustand Stores ──► @automd/shared (parser/mutators)│
└──────────┬──────────────────────┬────────────────────┘
           │ HTTP / WebSocket     │ localStorage
           │                      │ (offline mode)
┌──────────▼──────────┐    ┌──────▼───────────────────┐
│  @automd/server     │    │  Browser localStorage    │
│  Express + WS :4800 │    └──────────────────────────┘
│  Storage: ~/.automd/ │
└──────────┬──────────┘
           │ HTTP API
┌──────────▼──────────┐
│    @automd/mcp      │
│  MCP Server (stdio) │◄── Claude Desktop / Claude CLI
└─────────────────────┘
```

**Data flow:** Markdown files → parsed to AST (remark) → tasks/columns extracted → UI mutations produce new AST → serialized back to markdown → synced via WebSocket.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start server + web app concurrently
pnpm dev
```

The web app runs on [http://localhost:5173](http://localhost:5173) and the API server on [http://localhost:4800](http://localhost:4800).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start server + web app concurrently |
| `pnpm dev:web` | Start Vite dev server only |
| `pnpm dev:server` | Start API server only (with watch) |
| `pnpm dev:mcp` | Start MCP server only (with watch) |
| `pnpm build` | Type-check and build for production |
| `pnpm test` | Run all tests |
| `pnpm lint` | Run ESLint |
| `pnpm preview` | Preview production build |

## Environment Variables

Copy `.env.example` to `.env` for local overrides:

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOMD_PORT` | `4800` | API server port |
| `VITE_AUTOMD_SERVER` | `http://localhost:4800` | Server URL used by the frontend |

## Project Structure

```
automd/
├── src/                          # React frontend
│   ├── components/               # UI components (editor, checklist, kanban, etc.)
│   ├── store/                    # Zustand stores (document, files, UI state)
│   ├── hooks/                    # React hooks (sync, keyboard shortcuts, search)
│   └── lib/                      # Utilities, templates, markdown helpers
├── packages/
│   ├── shared/                   # @automd/shared — markdown parsing & mutation
│   │   └── src/
│   │       ├── parser.ts         # Markdown → AST (remark)
│   │       ├── serializer.ts     # AST → Markdown
│   │       ├── id-annotator.ts   # Stable task/heading ID generation
│   │       ├── task-extractor.ts # Extract tasks & columns from AST
│   │       ├── task-mutator.ts   # Pure AST mutation functions
│   │       ├── metadata-parser.ts    # Parse inline metadata tokens
│   │       └── metadata-serializer.ts # Serialize metadata back to text
│   ├── server/                   # @automd/server — REST API + WebSocket
│   │   └── src/
│   │       ├── index.ts          # Server entry point
│   │       ├── storage.ts        # Filesystem storage (~/.automd/)
│   │       ├── ws.ts             # WebSocket broadcast
│   │       ├── write-lock.ts     # Concurrent write serialization
│   │       └── routes/           # Express route handlers
│   └── mcp/                      # @automd/mcp — MCP server for LLM agents
│       └── src/
│           ├── index.ts          # MCP server entry
│           ├── tools.ts          # Board, task, column, search tools
│           ├── prompts.ts        # Triage, standup, sprint planning prompts
│           └── resources.ts      # Board and project resources
├── package.json                  # Root workspace config
├── pnpm-workspace.yaml           # Workspace packages
├── vite.config.ts                # Vite + React + TailwindCSS
└── vitest.config.ts              # Test configuration
```

## Task Metadata Format

Tasks support inline metadata tokens:

```markdown
- [ ] Implement login @alice @bob #backend #auth priority:high due:2025-04-01 est:8h
```

| Token | Example | Description |
|-------|---------|-------------|
| `@username` | `@alice` | Assignee |
| `#label` | `#backend` | Label/tag |
| `priority:level` | `priority:high` | Priority (high, medium, low) |
| `due:date` | `due:2025-04-01` | Due date (ISO format) |
| `est:hours` | `est:8h` | Time estimate |
| `created-by:user` | `created-by:sarah` | Creator |
| `built-by:user` | `built-by:alex` | Builder |
| `archived:true` | `archived:true` | Archive flag |

## Storage

Data is stored at `~/.automd/`:

```
~/.automd/
├── manifest.json     # Board and project metadata index
└── boards/
    ├── my-board.md   # Board content as markdown
    └── ...
```

## MCP Integration (Claude Desktop)

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "automd": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/automd/packages/mcp/src/index.ts"],
      "env": {
        "AUTOMD_SERVER_URL": "http://localhost:4800"
      }
    }
  }
}
```

Make sure the AutoMD server is running (`pnpm dev:server`) before using the MCP tools.

## Testing

```bash
# Run all tests
pnpm test

# Run shared library tests
pnpm --filter @automd/shared test

# Run server API tests
pnpm --filter @automd/server test

# Watch mode (from root)
pnpm test -- --watch
```
