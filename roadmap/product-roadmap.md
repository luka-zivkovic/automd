# AutoMD Product Roadmap

AutoMD is an AI-native, markdown-based project management tool. Every board is a `.md` file (H1 = columns, H2 = tasks). Three views: editor, checklist, kanban. 20 MCP tools for AI agents. Self-hosted (Docker) or local-only (browser).

**Target audience:** Tinkerers and AI enthusiasts — not just developers.
**Goals:** Grow self-hosted users AND launch cloud hosting in parallel.
**Core differentiator:** Markdown-native + AI-native. No lock-in, human-readable files, AI agents as first-class citizens.

---

## v0.2 — "Sticky" (Make users come back daily)

| Feature | Description | Size |
|---|---|---|
| Recurring tasks | `recur:daily/weekly/monthly` metadata token. On check-off, auto-creates next occurrence. Extend `metadata-parser.ts` + `task-mutator.ts` | M |
| Due date sort + overdue highlighting | Sort-by-due in filter bar, red glow on overdue cards, overdue count in sidebar | S |
| Keyboard shortcuts expansion | `n` = new task, `e` = editor, `/` = focus filter, arrow nav for kanban cards | S |
| Board settings via YAML frontmatter | Per-board defaults (default column, WIP limits, column colors). Add `remark-frontmatter` to parser pipeline | M |
| MCP: `get_overdue_tasks` + `get_my_tasks` | New search tools for AI agents. Makes standup/triage prompts much better | S |
| Onboarding flow | First-run guided tour for non-dev users: create board, add task, switch views, try command palette | M |

**Why:** Retention before growth. Recurring tasks + overdue visibility are the top reasons people abandon new PM tools.

---

## v0.3 — "Share" (Turn users into distribution)

| Feature | Description | Size |
|---|---|---|
| Public share links | `GET /api/public/:shareToken` — read-only rendered board, no auth required. Share token in manifest entry | L |
| Embed mode | `?embed=true` strips chrome (sidebar, header). Enables iframe embedding in blogs/docs | S |
| Export to PNG | html-to-image on kanban view. Share snapshots on social/Slack | S |
| Comments (markdown-native) | Blockquotes under H2: `> @alice [2025-03-01]: Comment text`. Parsed in `task-extractor.ts`, shown in TaskDetailPanel | L |
| MCP: `share_board` + `add_comment` | Agents can share boards and leave comments programmatically | S |

**Why:** Every shared board is a landing page. Comments enable lightweight collaboration without multi-user auth.

---

## v0.4 — "Copilot" (AI as a teammate)

| Feature | Description | Size |
|---|---|---|
| AI task suggestions | MCP prompt `suggest_tasks` — gap analysis for a board. Also a UI button "Ask AI for suggestions" | M |
| Natural language task creation | "deploy on Friday at 3pm" in task input — auto-extracts due date, title, priority. Local parser, no API call | M |
| AI activity summaries | MCP prompt `weekly_summary` — digest card in activity feed: velocity, who did what, trends | M |
| Agent attribution UI | Show `built-by:` on kanban cards with robot icon, "Built by AI" filter, AI contributions section | S |
| MCP prompt: `retrospective` | Reviews completed tasks, identifies wins/slips, suggests process improvements | S |
| Webhooks | POST to user-configured URL on board changes. Stored in YAML frontmatter. Foundation for GitHub sync + Zapier/n8n | M |

**Why:** "AI-native" must be felt within 5 minutes. Suggestions + NL input are the two features that make that happen for non-dev users.

---

## v0.5 — "Together" (Multi-user + collaboration)

| Feature | Description | Size |
|---|---|---|
| Multi-user auth | `auth.json` evolves from single admin to `{ users: [...] }` with roles: admin/member/viewer. Per-user sessions + API keys | L |
| User profiles + avatars | Name, Gravatar, color per user. Shown in presence + task assignments | M |
| Per-board permissions (`.ee.`) | Board-level access control: owner/editor/viewer. Enterprise-gated | L |
| Real-time cursors | Show other users' cursor positions in editor via WebSocket | M |
| In-app notifications | Bell icon. Events: assigned to task, commented, board shared. Stored in `notifications.json` sidecar | M |
| MCP: user-scoped tools | `get_my_tasks`, `get_my_notifications`. API key per-user so agent knows who it works for | S |

**Why:** Multi-user gates paid plans, cloud revenue, and enterprise. Makes existing presence/activity features actually useful.

---

## v0.6 — "Connect" (Integrations + ecosystem)

| Feature | Description | Size |
|---|---|---|
| GitHub issue sync (`.ee.`) | Bidirectional: H2 tasks <-> GitHub issues. Webhooks + API. Issue #16. Enterprise-gated | L |
| Calendar view | Fourth view type. Tasks rendered by due date on month/week grid | L |
| File attachments | Upload to `~/.automd/attachments/` or S3. Referenced as `![](automd://attachments/id)` | M |
| Mobile-responsive layout | Sidebar overlay, kanban horizontal scroll, task detail as full-screen sheet. CSS/Tailwind only | M |
| OAuth/SSO (`.ee.`) | SAML + OIDC for enterprise. Enterprise-gated | L |
| MCP: `sync_github` + `create_calendar_event` | Agent-triggered GitHub sync and calendar task creation | S |

**Why:** Integrations increase stickiness and justify paid plans. GitHub sync is the killer feature for the tinkerer audience.

---

## Summary

```
v0.2  Sticky     Recurring tasks, overdue, shortcuts, onboarding
v0.3  Share      Public links, embeds, comments, export
v0.4  Copilot    AI suggestions, NL input, summaries, webhooks
v0.5  Together   Multi-user, permissions, cursors, notifications
v0.6  Connect    GitHub sync, calendar view, attachments, mobile
```

Cloud hosting (Fly.io, Polar.sh billing, dashboard) is handled separately in the `automd-cloud` repo.

Each milestone adds MCP capabilities to compound the AI advantage. Ordering: stickiness > growth > monetization > enterprise.

---

## Key Implementation Notes

- **Recurring tasks (v0.2):** New metadata token in `metadata-parser.ts`, recurrence logic in `task-mutator.ts` triggered after `toggleTask`
- **Comments (v0.3):** Blockquotes under H2 headings keep everything in the `.md` file. `task-extractor.ts` extracts them as a `comments` field on `Task` type
- **Board settings (v0.2+):** Add `remark-frontmatter` plugin to the parser pipeline. YAML frontmatter becomes the extensible store for per-board config
- **Multi-user (v0.5):** `auth-storage.ts` migrates from `{ admin }` to `{ users: [] }`. `validateToken`/`validateApiKey` already work generically, just need to return user ID
- **Public share links (v0.3):** New `shareToken` field in manifest. Unauthenticated route placed before auth middleware in `app.ts`
- **Enterprise features:** Gated by `.ee.` filename convention (per-board permissions, GitHub sync, OAuth/SSO)

## Related GitHub Issues

- [#14](https://github.com/luka-zivkovic/automd/issues/14) — Block-level merge for concurrent edits (deferred, revisit at v0.5)
- [#16](https://github.com/luka-zivkovic/automd/issues/16) — GitHub sync (scheduled for v0.6)
