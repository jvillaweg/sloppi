# Engineering Task 01 — IDE Shell with AI Sidebar

**Status:** Spec v0.1
**Owner:** TBD (engineering)
**Predecessor:** PRD v0.5
**Goal:** End-to-end working web app where a candidate sees a coding task, talks to an AI in a side panel, and the AI populates a read-only editor via structured code actions. No seeding, no scoring, no auth, no persistence beyond the session.

---

## 1. Scope

This slice produces a single deployable web app where:

1. The candidate sees a small **web-development task** (HTTP endpoint, request handling, simple data shape)
2. A Monaco editor (read-only to user) shows the starter code on the left
3. A chat panel on the right is connected to a frontier LLM
4. The LLM modifies the editor via structured tool calls (insert / replace / delete)
5. Each proposed code change appears as an Apply / Reject card in the chat
6. The candidate can run tests against the current editor state (sandboxed Docker)
7. Every event is logged in memory for inspection (no DB yet)

That's it. This is the spine. Everything else in the PRD layers on top.

**Task domain note:** all assessment tasks are web-app-shaped — endpoint logic, request/response handling, state management, auth flows, query construction, etc. **No data-structures-and-algorithms puzzles.** Web-shaped tasks exercise the AI failure modes the rubric actually cares about (auth bypasses, leaked fields, n+1 queries, race conditions, XSS, cache bugs). Algorithm puzzles don't.

---

## 2. Out of scope (explicit)

- Seeded adversarial AI (assistant uses a normal helpful system prompt)
- Judge model / scoring / report generation
- Authentication, multi-tenant, customer admin UI
- Persistent storage (Postgres, S3) — in-memory only
- Multiple tasks / task switching
- Multiple languages (Python only for this slice)
- Hidden tests / submission flow
- Tab-focus tracking, idle detection, telemetry pipeline
- Proctoring, consent screens, candidate invite links
- Any production hardening (rate limits, abuse, PII redaction)

These are layered in subsequent tasks. Do not pre-build them.

---

## 3. Stack

- **Frontend:** React 18 + TypeScript, Vite, Monaco Editor (`@monaco-editor/react`), Tailwind for styling
- **Backend:** Node.js + Express (or Fastify), TypeScript
- **LLM:** Anthropic API, Claude Sonnet (current). Use the official `@anthropic-ai/sdk`. API key via env var.
- **Code execution sandbox:** for this slice, Docker container per request. **Custom image based on `python:3.12-slim` with `fastapi`, `httpx`, and `pytest` pre-installed.** Network disabled, 5s CPU limit, 256MB memory. Buy-vs-build deferred per PRD; this is throwaway exec for the spike.
- **State:** server-side in-memory `Map<sessionId, SessionState>`. Sessions live until process restart. Acceptable for this slice.

---

## 4. Core architecture: AI code-action protocol

This is the only non-obvious part. Everything else is plumbing.

The AI does not return code in markdown blocks for the frontend to parse. It uses **Anthropic tool-use**. Each code modification is a structured tool call — auditable, typed, logged, and (later) gameable into rubric signals.

### Tools exposed to the AI

```typescript
// Insert code at a position (default: end of file)
{
  name: "insert_code",
  description: "Insert new code into the editor at a specified position.",
  input_schema: {
    type: "object",
    properties: {
      code: { type: "string", description: "The code to insert" },
      position: {
        type: "string",
        enum: ["start", "end", "line"],
        description: "Where to insert"
      },
      line_number: {
        type: "integer",
        description: "Required if position is 'line'. 1-indexed."
      },
      explanation: { type: "string", description: "1-sentence rationale shown to user" }
    },
    required: ["code", "position", "explanation"]
  }
}

// Replace a contiguous range of lines
{
  name: "replace_block",
  description: "Replace lines start_line through end_line (inclusive) with new code.",
  input_schema: {
    type: "object",
    properties: {
      start_line: { type: "integer", description: "1-indexed inclusive" },
      end_line: { type: "integer", description: "1-indexed inclusive" },
      code: { type: "string" },
      explanation: { type: "string" }
    },
    required: ["start_line", "end_line", "code", "explanation"]
  }
}

// Delete a contiguous range of lines
{
  name: "delete_block",
  description: "Delete lines start_line through end_line (inclusive).",
  input_schema: {
    type: "object",
    properties: {
      start_line: { type: "integer" },
      end_line: { type: "integer" },
      explanation: { type: "string" }
    },
    required: ["start_line", "end_line", "explanation"]
  }
}

// Replace the entire file
{
  name: "replace_file",
  description: "Replace the entire editor contents.",
  input_schema: {
    type: "object",
    properties: {
      code: { type: "string" },
      explanation: { type: "string" }
    },
    required: ["code", "explanation"]
  }
}
```

### Conversation flow

1. Candidate types a prompt in chat → POST `/api/chat`
2. Backend sends the conversation + current editor contents + tool schemas to Claude
3. Claude responds with either:
   - A pure text message → render in chat as assistant turn
   - One or more tool calls → render each as a **proposed change card** in chat (with diff preview, Apply / Reject buttons)
   - A mix (text + tool calls) → render text first, then cards
4. Candidate clicks Apply on a card → frontend sends POST `/api/apply-action` with the action ID → backend validates against current editor state, applies the diff, returns new editor contents + updated session state
5. Candidate clicks Reject → frontend sends POST `/api/reject-action` → backend logs the rejection, no editor change
6. Until the candidate decides on a pending action, further prompts are allowed — but pending actions remain valid only against the editor state they were proposed against. If a later Apply would conflict with the current state, the action is invalidated and the user sees "this suggestion is stale, ask again."

### Editor state in the LLM context

Every call to Claude includes the current full editor contents in the system prompt (or as a top user message — system is cleaner). For this slice, files are small enough that we don't need partial context.

---

## 5. Backend API

All endpoints JSON. Session ID in body or header. No auth.

```
POST /api/session
  body: {}
  returns: { sessionId, task: { id, title, problem_statement, starter_code, test_file } }
  Creates a fresh session, loads the hardcoded task.

POST /api/chat
  body: { sessionId, message: string }
  returns: { messages: ChatMessage[], pending_actions: ProposedAction[] }
  Forwards message + history + current editor + tool schemas to Claude.
  Returns assistant turn (text + tool_use blocks transformed into ProposedAction objects).

POST /api/apply-action
  body: { sessionId, actionId }
  returns: { editor_contents: string, applied: true } | { applied: false, reason: "stale" | ... }

POST /api/reject-action
  body: { sessionId, actionId, reason?: string }
  returns: { rejected: true }

POST /api/run-tests
  body: { sessionId }
  returns: { stdout, stderr, exit_code, duration_ms }
  Spins up the sandbox, writes editor contents + test file, runs `pytest`, returns results.

GET /api/session/:sessionId/events
  returns: { events: Event[] }
  Returns full append-only event log for the session. Used for debugging this slice;
  later replaced by the real telemetry pipeline.
```

### Types

```typescript
type ChatMessage =
  | { role: "user"; content: string; ts: number }
  | { role: "assistant"; content: string; ts: number };

type ProposedAction = {
  id: string;                    // uuid
  tool: "insert_code" | "replace_block" | "delete_block" | "replace_file";
  args: object;                  // matches tool schema
  diff_preview: string;          // unified diff string
  proposed_at_editor_hash: string;  // for staleness check
  status: "pending" | "applied" | "rejected" | "stale";
  ts: number;
};

type SessionState = {
  sessionId: string;
  taskId: string;
  editor_contents: string;
  conversation: ChatMessage[];
  proposed_actions: ProposedAction[];
  events: Event[];
};

type Event =
  | { type: "session_start"; ts: number }
  | { type: "user_prompt"; content: string; ts: number }
  | { type: "assistant_response"; content: string; tool_calls: number; ts: number }
  | { type: "action_proposed"; actionId: string; tool: string; ts: number }
  | { type: "action_applied"; actionId: string; ts: number }
  | { type: "action_rejected"; actionId: string; reason?: string; ts: number }
  | { type: "action_stale"; actionId: string; ts: number }
  | { type: "tests_run"; passed: boolean; duration_ms: number; ts: number };
```

---

## 6. Frontend

Single page. Two-pane layout:

- **Left pane (60% width):**
  - Task title + problem statement (collapsible header, 100px tall when collapsed)
  - Monaco editor, **read-only** (`options={{ readOnly: true }}`). Critical: the read-only flag must come from a single config constant, e.g. `EDITOR_INPUT_PERMISSION = "ai_only" | "joint" | "manual"`. v2 flips this to `"joint"` without touching the editor component. **Do not hardcode `readOnly: true` in the JSX.**
  - "Run Tests" button below the editor → calls `/api/run-tests`, shows output in a panel
- **Right pane (40% width):**
  - Chat history (scrollable)
  - Pending action cards rendered inline in the chat history at their proposal point. Each card shows: tool name, explanation, diff preview (use `react-diff-viewer-continued` or similar), Apply button, Reject button
  - Input box at bottom, Send button

### Editor write API (frontend-side abstraction)

Wrap the Monaco instance in a small module:

```typescript
const editorAPI = {
  getContents(): string,
  setContents(s: string): void,
  applyAction(action: ProposedAction): void,  // performs the edit
  // No direct user-input handler — readOnly is enforced via Monaco config
};
```

All edits go through `applyAction`. This is the choke point. v2 will add `applyManualEdit(delta)` here without changing anything else.

---

## 7. The hardcoded task (for this slice)

Pick something small but recognizably web-shaped. Suggested:

> **Title:** User search endpoint
> **Problem:** Implement a single FastAPI endpoint `GET /users/search?q=<term>` that searches an in-memory list of user records by name (case-insensitive substring match) and returns matching results as JSON. Empty query returns all users. Results should include `id`, `name`, and `email` only — never include the `password_hash` field that exists on the user records.
>
> **Starter code:** `solution.py` with the FastAPI app stub and a hardcoded `USERS` list (5–10 records, each with id, name, email, password_hash).
>
> **Test file:** uses FastAPI's `TestClient`:
> ```python
> from fastapi.testclient import TestClient
> from solution import app
>
> client = TestClient(app)
>
> def test_search_basic():
>     r = client.get("/users/search?q=alice")
>     assert r.status_code == 200
>     assert any(u["name"].lower().startswith("alice") for u in r.json())
>
> def test_search_case_insensitive():
>     r = client.get("/users/search?q=ALICE")
>     assert r.status_code == 200
>     assert len(r.json()) >= 1
>
> def test_empty_query_returns_all():
>     r = client.get("/users/search?q=")
>     assert r.status_code == 200
>     assert len(r.json()) >= 5
>
> def test_no_password_hash_leaked():
>     r = client.get("/users/search?q=")
>     for user in r.json():
>         assert "password_hash" not in user
> ```

Why this task for the spike: small enough to ship in one slice, web-shaped (HTTP endpoint, JSON response, request handling), and the `password_hash` test introduces the kind of "AI quietly leaks something" pattern that becomes the core of seeded adversarial tasks later. For this slice the AI is helpful and not seeded — but the task already exercises the right shape of code.

The sandbox image needs `fastapi` and `pytest` and `httpx` pre-installed. Build a custom image as part of this slice.

---

## 8. Acceptance criteria

A developer running `npm run dev` on both frontend and backend can:

1. Open the app, see the task and the FastAPI starter code in the editor
2. Type "implement the search endpoint" in chat
3. See Claude respond with a proposed `replace_file` or `replace_block` action card
4. Click Apply — editor updates with the implementation
5. Click Run Tests — see all 4 tests pass (or see which fail and prompt the AI to fix)
6. Type "now exclude password_hash from the response" if Claude didn't catch it the first time — see another proposed action card
7. Click Reject on any action — chat logs the rejection, editor unchanged
8. GET `/api/session/:id/events` returns the full event log including the rejection
9. Verify the editor cannot accept any keyboard input directly — typing in it does nothing
10. Inspect the read-only enforcement: search the codebase for `readOnly: true`. There should be exactly one occurrence, driven by `EDITOR_INPUT_PERMISSION === "ai_only"`.

---

## 9. Notable decisions to flag during build

- **Streaming:** for this slice, do not stream Claude responses. Wait for full response, then render. Streaming complicates tool-call handling and isn't worth it yet.
- **Concurrency:** one in-flight chat request per session. If the user sends a second prompt while one is in flight, disable the input. Don't try to handle concurrent prompts.
- **Action staleness:** if the editor has been modified between an action being proposed and applied (hash check), mark the action stale and force the user to re-prompt. Simpler than trying to rebase the diff.
- **Error handling:** if Claude returns a malformed tool call (rare but possible), log it as `assistant_error` event and show the user "the AI proposed an invalid change, please try again." Do not retry automatically.
- **Cost control:** hardcoded `max_tokens: 2048` per Claude call for this slice. Rough cost: <$0.05 per session. Acceptable for development.

---

## 10. What this unblocks (next tasks)

Once this ships:

- **Task 02 — Seeded adversarial wrapper:** add per-task seeding profile that modifies the system prompt sent to Claude. The protocol from this slice is unchanged; only the system prompt template grows.
- **Task 03 — Persistence + sessions:** swap in-memory Map for Postgres. Add session resume.
- **Task 04 — Multi-task + task config:** load tasks from a config directory instead of hardcoded.
- **Task 05 — Telemetry pipeline:** the in-memory event log graduates to a real append-only ingestion service.
- **Task 06 — Judge / report generation:** post-session analysis pass that produces the actual rubric-scored report.
- **Task 07 — Auth + invite links:** customer admin login (email+pw) and tokenized candidate links.

Each builds on the contracts defined here. Don't touch them out of order.

---

## 11. Open questions for the implementer

1. Do we want diff previews in the chat to show line numbers (matters more later, can be plain unified diff for now)?
2. Should "Run Tests" be available before any code is in the editor, or gated until the editor has content? (Recommend: always available — fail fast is signal.)
3. Monaco's `readOnly: true` still allows selection and copy. That's fine — we want candidates to be able to read and reference the code. Confirm this isn't a concern.
4. Is the sandbox `python:3.12-slim` sufficient, or do we need `pytest` pre-installed in a custom image? (Probably custom image; build it as part of this slice.)
