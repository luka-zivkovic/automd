# Contributing to AutoMD

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/luka-zivkovic/automd.git
cd automd

# Install dependencies (requires pnpm)
pnpm install

# Start development server + frontend
pnpm dev
```

The frontend runs on `http://localhost:5173` and the API server on `http://localhost:4800`.

## Project Layout

- `src/` — React frontend (Vite + Tailwind + Zustand)
- `packages/shared/` — Markdown parsing and mutation library
- `packages/server/` — Express API + WebSocket server
- `packages/mcp/` — MCP server for AI agent integration

## Code Style

- TypeScript throughout — strict mode enabled
- ESLint for linting: `pnpm lint`
- Use existing patterns and conventions in the codebase

## Testing

Run tests before submitting a PR:

```bash
pnpm test
```

Package-specific tests:

```bash
pnpm --filter @automd/shared test
pnpm --filter @automd/server test
```

## Pull Requests

1. Fork the repo and create a feature branch from `master`
2. Make your changes with clear, focused commits
3. Ensure `pnpm test` and `pnpm lint` pass
4. Open a PR with a description of what you changed and why

## Enterprise Features

Files containing `.ee.` in their filename are enterprise-only features covered by the AutoMD Enterprise License. Contributions to these files require a signed contributor agreement. Contact hello@automd.io for details.

## Reporting Issues

Use [GitHub Issues](https://github.com/luka-zivkovic/automd/issues) for bug reports and feature requests.
