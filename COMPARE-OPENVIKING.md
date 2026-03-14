# AutoMD vs OpenViking: Deep Comparison

## Overview

| | **AutoMD** | **OpenViking** |
|---|---|---|
| **What it is** | AI-native task management using plain markdown files | Context database for AI agents (filesystem paradigm) |
| **By** | luka-zivkovic | Volcengine (ByteDance) |
| **GitHub stars** | — | 10.4k+ |
| **License** | Sustainable Use License | Apache 2.0 |
| **Tech stack** | TypeScript, React, Express, WebSocket | Python, Rust (CLI), C++ (perf-critical), Go |
| **Primary user** | Humans (with AI as assistant) | AI agents (programmatic) |
| **Data model** | Markdown files with inline metadata tokens | Virtual filesystem (`viking://`) with hierarchical context levels |
| **AI integration** | MCP server (Claude reads/writes boards) | Client-server (agents query context DB at runtime) |
| **Storage** | Plain `.md` files on disk (`~/.automd/`) | Vector search + directory-based retrieval |
| **Runtime** | Express server + WebSocket for real-time sync | Persistent server during agent execution |
| **UI** | Full React frontend (editor, kanban, checklist, dashboard) | CLI (`ov`) + minimal console web UI |

These are fundamentally different products — AutoMD is a **task management app**, OpenViking is **infrastructure for agent builders** — but there are 4 areas where OpenViking's approach offers valuable ideas for AutoMD.

---

## 1. Tiered Context Loading

### How OpenViking Does It

OpenViking organizes all agent context into a virtual filesystem under the `viking://` protocol. Each node automatically gets three representation layers:

| Tier | Name | Token Budget | Purpose |
|------|------|-------------|---------|
| **L0** | Abstract | ~100 tokens | One-sentence summary for vector search and quick filtering |
| **L1** | Overview | ~2,000 tokens | Core information for agent planning/reranking |
| **L2** | Detail | Unlimited | Full source data, loaded only when deep reading is needed |

**Summary generation pipeline:**
1. When content is written to the filesystem, the `TreeBuilder` queues summary generation
2. A `QueueManager` processes the queue, calling an LLM to produce `.abstract.md` (L0) and `.overview.md` (L1) for each node
3. These summaries are stored alongside the original content
4. Historical session archives also maintain their own L0/L1 files

**Progressive drill-down retrieval:**
1. **Intent Analysis** — Decomposes the query into multiple retrieval conditions
2. **Initial Positioning** — Vector search over L0 abstracts identifies the highest-scoring directory
3. **Refined Exploration** — L1 overviews within that directory are loaded for reranking
4. **Recursive Drill-down** — Repeats through subdirectories layer by layer
5. **Result Aggregation** — Only the most relevant L2 content is finally loaded

**Results (LoCoMo10 benchmark, 1,540 cases):**
- Baseline: 35.65% task completion, 24.6M input tokens
- OpenViking (memory disabled): 52.08% completion, 4.3M tokens (83% reduction)
- OpenViking (memory enabled): 51.23% completion, 2.1M tokens (**91% reduction**)

### What AutoMD Does Today

AutoMD's MCP layer currently serves context with **no tiering**. Every tool returns full-fidelity data:

- `get_item` / `get_item_markdown` — Returns complete JSON or markdown for an item (all columns, all tasks, all metadata)
- `search_tasks` — Iterates over **every item**, calls `api.getFile()` for each (loading full markdown), then filters client-side
- `search_context` — Same: loads every item fully, then filters for tasks with descriptions/AC/learnings
- `find_knowledge` — Same: loads all items, filters for `knowledge:true` or tasks with learnings
- `synthesize_topic` — Delegates to `GET /api/context`, which also iterates all files with full markdown parsing
- Sprint planning prompts serialize the entire board as JSON into the prompt, regardless of board size

### What AutoMD Could Do

A tiered context model for AutoMD would map naturally:

**L0 (Abstract, ~100 tokens per item):**
- Item name, type, project, task count, column names, last updated
- Already partially exists in `GET /api/files` listing (omits markdown), but MCP tools don't use this lightweight form consistently

**L1 (Overview, ~500-2k tokens per item):**
- Column names with task titles and status (checked/unchecked), priority, labels, due dates
- No descriptions, no acceptance criteria, no learnings, no subtask details
- Enough for an agent to decide which tasks to drill into

**L2 (Detail, full content):**
- Full task with description, acceptance criteria, subtask checkboxes, learnings
- Only loaded when agent explicitly requests a specific task

**Concrete changes:**
1. Add an optional `depth` or `tier` parameter to `get_item` to control detail level
2. Make search tools (`search_tasks`, `search_context`, `find_knowledge`) server-side operations that return L0/L1 results with an option to expand to L2
3. Make `synthesize_topic` return progressive responses: list of matching items (L0) → summaries of relevant tasks (L1) → agent requests L2 for specific tasks
4. Add tiered MCP resource URIs: `automd://items` (L0), `automd://items/{id}/overview` (L1), `automd://items/{id}` (L2)
5. Summary generation can be done by **projection** (selecting fewer fields from parsed data) rather than LLM-generated summarization — simpler and deterministic given AutoMD's structured data

---

## 2. Retrieval Visualization

### How OpenViking Does It

OpenViking's "Visualized Retrieval Trajectories" are an emergent property of its hierarchical retrieval architecture:

**Intent decomposition:**
- An `IntentAnalyzer` LLM produces 0-5 `TypedQuery` objects per user query, each with a context type (MEMORY/RESOURCE/SKILL), intent description, and priority (1-5)

**Hierarchical tree traversal:**
- Retrieval proceeds as a priority-queue BFS through a directory tree
- Root directories are selected based on context type
- Global vector search identifies top-3 starting directories
- A min-heap `dir_queue` of `(-score, uri)` drives traversal
- Score propagation: `final_score = alpha * embedding_score + (1-alpha) * parent_score`
- `visited` set prevents revisiting; convergence detection stops when top-k is stable for 3 rounds

**What makes this "visualization":**
- The filesystem structure itself is the explanation — results have paths like `/resource/api-docs/auth/oauth2/flow.md` rather than opaque vector similarity scores
- The `BuildingTree` class provides a `path_to_root(uri)` method that reconstructs the full retrieval path
- A minimal console web UI serves a filesystem tree browser where users can navigate the hierarchy
- Internal logging records step-level events like `[RecursiveSearch] Entering URI: {uri}`

**Value vs flat RAG:** A flat vector search returns opaque similarity scores. OpenViking returns navigable paths — the hierarchy *explains* the result. Score propagation transparency means you can trace why a deep node ranked highly (its parent directory scored well).

### What AutoMD Does Today

- **Activity Feed** — A 320px sidebar showing file/project CRUD events (created, updated, deleted). Max 100 events, in-memory only (Zustand store), no persistence. No filtering or drill-down.
- **Context API** — `GET /api/context` does simple text substring matching across all boards. No trajectory/provenance tracking — just flat search.
- **WebSocket** — Broadcast-based presence + file change events.

**Key gaps:**
- No retrieval path tracking (when context API finds matching knowledge, it doesn't record how it matched)
- Activity feed is CRUD-only — agent reads/retrievals are invisible
- No query decomposition or multi-query strategy
- No score/relevance feedback

### What AutoMD Could Do

1. **Query tracing on `/api/context`** — Log which boards were scanned, which tasks matched topic/label filters, which were excluded. Return this as optional `trace` metadata alongside results.
2. **Retrieval events in Activity Feed** — When an agent calls the context API, emit a `context:retrieved` event showing the query, match count, and sources consulted.
3. **Relevance scoring** — Instead of boolean topic/label matching, introduce scored ranking so users can see *why* a knowledge item was returned (matched title vs. description vs. learning text).
4. **Board-as-directory navigation** — Surface the retrieval path ("Board X → Task Y → Learning Z") in results, mirroring OpenViking's filesystem trajectory concept.
5. **Session-level retrieval history** — Track all context retrievals within an agent session to show patterns: which knowledge gets reused, which queries return empty, enabling knowledge gap analysis.

---

## 3. Automatic Session Management & Memory Self-Iteration

### How OpenViking Does It

OpenViking implements a sophisticated session-to-memory pipeline:

**Session commit pipeline:**

When a session is committed (`session.commit()`):

1. **Archive** — Current messages are written to `history/archive_NNN/` in JSONL format
2. **Structured Summary** — An LLM generates a deterministic (temperature=0.0) summary with 10 sections: overview, analysis milestones, user intent, key concepts, context references (viking:// URIs), errors/fixes, preserved user quotes, pending tasks, current work state, recommended next steps. Max 1,000 words.
3. **Memory Extraction** — `MemoryExtractor` feeds all formatted messages (including tool call metadata: name, input, output, duration, status) through a compression prompt template
4. **Deduplication** — Each candidate is vector-searched against existing memories, then an LLM decides: CREATE, MERGE, SKIP, or DELETE
5. **Persistence** — Accepted memories are written as `.md` files under `viking://` URIs

**What gets preserved as long-term memory:**
- User profile information (always preserved, never deduplicated away)
- Preferences, entities, and their relationships
- Events, decisions, milestones (time-bound)
- Problem-solution pairs ("cases")
- Reusable processes/methods ("patterns")
- Tool optimization data (call counts, success rates, duration, tokens)
- Skill execution workflows and success metrics
- Specific proper nouns, parameter names, numeric values, version numbers (preserved exactly)

**What gets discarded:**
- Duplicates, paraphrases, too weak/uncertain candidates (SKIP)
- Messages without extractable content
- Relative time expressions
- Conversational filler — only actionable, reusable information survives

**Memory self-iteration (the core innovation):**

The system creates a feedback loop:
1. **Extract** — After each session, the LLM extracts candidate memories at L0/L1/L2 detail levels
2. **Deduplicate & Merge** — When a candidate overlaps with an existing memory, the deduplicator MERGEs them: combining abstracts/overviews, removing duplicates, keeping the most up-to-date details
3. **Accumulate Statistics** — For tools/skills, execution metrics are monotonically accumulated (counts never decrease)
4. **Progressive Refinement** — Each session's compression refines existing memories. A tool's Good/Bad Cases grow richer. Patterns get more examples. Preferences get corrected when new info contradicts old.

**Cross-session context:**
- `get_context_for_search()` scores archived sessions by keyword relevance and recency
- `tool_skill_utils.py` uses fuzzy matching (threshold 0.8) to canonicalize tool/skill names across sessions
- `increment_active_count()` boosts resource popularity metrics on every usage

### What AutoMD Does Today

- **MemoryView** — Aggregates knowledge items (`knowledge:true` tasks) and learnings (`### Learnings` sections) from all boards. Supports search/tag filtering and "Copy as context" for manual pasting.
- **Context API** — Returns structured knowledge briefs filtered by topic/labels.
- **Activity Feed** — In-memory only, max 100 CRUD events, no persistence.
- **MCP Prompts** — `find_knowledge`, `import_memories`, `synthesize_topic`, `retrospective` — all require manual invocation.
- **System Instructions** — Knowledge-first philosophy ("Before starting work, use find_knowledge; after completing work, add learnings") — but **all memory capture is manual**.

**Key gaps:**

| Capability | OpenViking | AutoMD |
|---|---|---|
| Session persistence | JSONL archives with structured summaries | None — activity is in-memory only |
| Automatic memory extraction | LLM extracts 8 categories per session | Manual only (user must invoke tools) |
| Memory self-iteration | Automatic merge/dedup/refine cycle | No iteration — knowledge is static once written |
| Conversation compression | 10-section structured summary + L0/L1/L2 | No compression — no conversations stored |
| Tool/skill tracking | Automatic stats accumulation | No tool usage tracking |
| Cross-session context | Keyword + recency scoring | No session concept |
| Deduplication | Vector search + LLM CREATE/MERGE/SKIP/DELETE | No deduplication |
| Resource popularity | `active_count` incremented per usage | No usage-based ranking |

### What AutoMD Could Do

AutoMD already has the storage layer (markdown files with knowledge items and learnings) but lacks the automated pipeline. Opportunities:

1. **Auto-extract learnings from MCP tool calls** — When an agent session ends (or after N tool calls), automatically extract key decisions, problem-solution pairs, and preferences into knowledge entries. This could be a server-side background job triggered by a `session:commit` event.

2. **Knowledge deduplication on write** — When `add_knowledge` or `update_learnings` is called, check existing knowledge for overlapping entries. Use text similarity (even simple TF-IDF) to suggest MERGE vs CREATE.

3. **Session persistence** — Persist the activity feed to disk. Track which MCP tools were called, with what arguments, and what was returned. This creates the raw material for automatic memory extraction.

4. **Progressive refinement** — When the same topic gets new learnings across sessions, merge them into a richer, consolidated knowledge entry rather than accumulating duplicates.

5. **Usage-based ranking** — Track which knowledge items are most frequently retrieved by agents. Surface high-usage items more prominently in search results and context briefs.

---

## 4. Directory-Based Organization

### How OpenViking Does It

OpenViking replaces flat vector stores with a virtual filesystem organized under the `viking://` protocol:

**Three primary context categories:**
- `viking://resources/` — Project docs, repos, web pages
- `viking://user/` — Personal preferences, interaction histories
- `viking://agent/` — Skills, instructions, task-specific memories

**Filesystem operations** (from `AGFSClient`):
- **Directory**: `ls`, `mkdir`, `rm -r`, `mv`, `stat`, `tree`
- **File**: `create`, `read`/`cat`, `write`, `touch`, `rm`, `chmod`
- **Search**: `grep` (regex, recursive, case-insensitive), `find` (semantic), `search`, `glob`
- **Content Access**: `read` (L2 full), `abstract` (L0), `overview` (L1)
- **Advanced**: `mount`/`unmount` (pluggable backends), POSIX-like file handles with `open`/`seek`/`read`/`write`/`sync`
- **CLI** (Rust `ov`): `add-resource`, `add-skill`, `link`/`unlink` (relations), `session new`/`session commit`, `import`/`export` (.ovpack)

**Directory Recursive Retrieval — the key innovation:**
1. Intent analysis generates multiple retrieval conditions from a query
2. Initial vector retrieval locates high-scoring **directories** (not individual chunks)
3. Secondary retrieval refines results **within** those directories
4. Recursive drill-down explores subdirectories systematically
5. Results are aggregated with full path context

**Advantages over flat vector stores:**
- **Global context view** — Users see the full knowledge landscape, not opaque retrieval results
- **Observable retrieval paths** — Every result has a URI trail (e.g., `viking://resources/backend/auth/oauth.md`)
- **Structured scoping** — Queries can target specific directories, avoiding irrelevant cross-domain hits
- **Self-evolution** — Session management places compressed memories into appropriate directories automatically

### What AutoMD Does Today

- **Flat storage** — All items live in a single `boards/` directory. The manifest tracks metadata (id, name, filename, timestamps) but not hierarchy.
- **One-level grouping** — Projects group items via `fileIds[]` array and `projectId` on items. No sub-projects, no nested folders.
- **Knowledge as tasks** — Knowledge items are tasks with `knowledge:true` metadata. They live as H2 headings within a knowledge base document. No deeper structure.
- **Linear search** — `find_knowledge` and `search_context` iterate every item and every task. No way to scope a search to "just the backend decisions" without manually filtering by labels.
- **No retrieval path visibility** — When knowledge is found, there is no structural context about where it sits relative to other knowledge.

### What AutoMD Could Do

1. **Nested knowledge organization** — Knowledge bases could support directories/categories like `security/auth/`, `backend/database/`. This enables both human navigation and scoped retrieval. Implementation: extend the frontmatter schema to support a `path` or `parent` field, or use heading hierarchy within a knowledge base document as implicit directories.

2. **Directory-scoped search** — Instead of scanning all items, queries could target `automd://project-name/knowledge/security/` and recursively search only that subtree. This is both faster and more relevant.

3. **Directory-level summaries** — Each project or knowledge category could have an auto-generated summary (simple aggregation, not LLM-required), so an agent can quickly assess "what's in the security project?" without loading every entry.

4. **Observable context paths** — Results returned as `Project → Board → Column → Task → Learning` would help agents and humans understand where knowledge lives and how it relates to other knowledge.

5. **The manifest model is already filesystem-adjacent** — AutoMD stores items as markdown files on disk with a manifest. The jump to supporting nested directories in that manifest is architecturally natural. The flat `boards/` directory could become a tree without changing the fundamental storage model.

---

## Summary: Priority & Effort Matrix

| Idea | Impact | Effort | Dependencies |
|------|--------|--------|-------------|
| **Tiered context loading** (L0/L1/L2) | High — directly reduces token cost and improves agent accuracy | Medium — projection-based tiers need no LLM, just API changes | None |
| **Retrieval visualization** (query tracing, retrieval events) | Medium — improves debuggability and trust | Low — mostly logging + metadata in API responses | Tiered context helps |
| **Automatic session/memory management** | High — biggest UX leap, knowledge grows organically | High — needs session persistence, extraction pipeline, dedup | Tiered context + directory org |
| **Directory-based organization** | High — enables scoped search, hierarchy, scalability | Medium-High — manifest/storage schema changes, UI updates | None, but enables everything else |

**Recommended starting order:**
1. **Tiered context loading** — Highest ROI, no dependencies, directly measurable token savings
2. **Directory-based organization** — Enables better retrieval and is the foundation for auto-session management
3. **Retrieval visualization** — Low effort, builds on the first two
4. **Automatic session management** — The capstone feature that ties everything together
