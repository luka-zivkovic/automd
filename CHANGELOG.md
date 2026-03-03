# Changelog

All notable changes to AutoMD will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Webhooks**: Real-time HTTP notifications for task, board, and project events
  - Slack and Discord message formatting templates
  - HMAC-SHA256 payload signing for security
  - Per-webhook delivery queues with exponential retry
  - Webhook management UI in the Connect panel
- **Onboarding improvements**: Template picker for new boards, better scroll handling
- **CI pipeline**: Automated type checking, linting, and tests on PRs

### Fixed
- Sidebar now opens by default for new users
- ConnectView and DashboardView scroll issues in flex layouts
- Missing pointer cursor on clickable onboarding cards

## [0.1.0] - 2025-05-01

### Added
- Initial release
- Markdown-native task management with kanban boards
- MCP server for AI agent integration (Claude, Cursor, Windsurf)
- Real-time collaboration via WebSocket
- Project organization with YAML frontmatter
- Task descriptions, acceptance criteria, subtasks, and learnings
- Docker deployment with GHCR publishing
- API key authentication
- S3 sync for cloud backup
