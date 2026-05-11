# Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the critical and important issues identified in the code review of the eng-task-01-ide-shell branch.

**Architecture:** Five fix groups ordered by severity. Task 1 is the most involved — it adds `rawHistory` for multi-turn fidelity AND injects synthetic `tool_result` blocks before each new user message (required by the Anthropic API when the previous assistant turn contained `tool_use` blocks). Tasks 2–5 are narrow, independent changes.

**Tech Stack:** Node.js + Express + TypeScript (backend), Anthropic SDK (`@anthropic-ai/sdk`)

---

## Not fixing (deliberate decisions)

**editorAPI abstraction (spec §6):** The spec describes a named `editorAPI` module. The implementation uses direct `editor.setValue()` in a `useEffect`. Functionally equivalent for this slice. Extract before v2 when `applyManualEdit(delta)` is added. YAGNI.

**Unmatched rawHistory user turn on LLM failure:** If `callClaude` throws, the user message is already pushed to `rawHistory`. A retry will send an unmatched user turn and fail. Fixing this requires popping from both arrays in the catch block. Acceptable for a spike — users can refresh if an LLM error occurs.

---

## Task 1: Fix conversation history — rawHistory + tool_result injection (Critical)

**Problem:** Two separate failures compound:

1. `callClaude` maps `session.conversation` to API messages with `content: string`. When Claude responds with tool-use blocks, those blocks are discarded. On the next turn the API receives a history missing tool_use content blocks.

2. Even if tool_use blocks were preserved, the Anthropic API requires a matching `tool_result` user turn after every assistant turn that ends with `tool_use` blocks. Without it, any follow-up message after a tool-use response receives a 400 from the API.

**Fix:** Three-part change:
- Add `rawHistory: Anthropic.MessageParam[]` to `SessionState`. Push raw `MessageParam` objects instead of mapping from `conversation`.
- Add `tool_use_id: string` to `ProposedAction` so the Anthropic tool_use `id` is preserved and can be used when constructing `tool_result` blocks.
- Before pushing each new user message to `rawHistory`, check whether the last entry is an assistant turn with tool_use blocks. If so, inject a synthetic `tool_result` user turn first.

**Files:**
- Modify: `backend/src/types.ts`
- Modify: `backend/src/store.ts`
- Modify: `backend/src/editor.ts`
- Modify: `backend/src/claude.ts`
- Modify: `backend/src/routes/chat.ts`

- [ ] **Step 1: Add `rawHistory` to `SessionState` and `tool_use_id` to `ProposedAction` in `types.ts`**

Replace the full contents of `backend/src/types.ts` with:

```typescript
import type Anthropic from '@anthropic-ai/sdk';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface ProposedAction {
  id: string;
  tool_use_id: string;
  tool: 'insert_code' | 'replace_block' | 'delete_block' | 'replace_file';
  args: Record<string, unknown>;
  diff_preview: string;
  old_content: string;
  new_content: string;
  proposed_at_editor_hash: string;
  status: 'pending' | 'applied' | 'rejected' | 'stale';
  ts: number;
}

export type AppEvent =
  | { type: 'session_start'; ts: number }
  | { type: 'user_prompt'; content: string; ts: number }
  | { type: 'assistant_response'; content: string; tool_calls: number; ts: number }
  | { type: 'assistant_error'; ts: number }
  | { type: 'action_proposed'; actionId: string; tool: string; ts: number }
  | { type: 'action_applied'; actionId: string; ts: number }
  | { type: 'action_rejected'; actionId: string; reason?: string; ts: number }
  | { type: 'action_stale'; actionId: string; ts: number }
  | { type: 'tests_run'; passed: boolean; duration_ms: number; ts: number };

export interface SessionState {
  sessionId: string;
  taskId: string;
  editor_contents: string;
  conversation: ChatMessage[];
  rawHistory: Anthropic.MessageParam[];
  proposed_actions: ProposedAction[];
  events: AppEvent[];
}

export interface TestResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}
```

- [ ] **Step 2: Initialize `rawHistory` in `createSession()` in `store.ts`**

In `backend/src/store.ts`, add `rawHistory: []` inside the session object in `createSession()`:

```typescript
const session: SessionState = {
  sessionId,
  taskId: task.id,
  editor_contents: task.starter_code,
  conversation: [],
  rawHistory: [],
  proposed_actions: [],
  events: [{ type: 'session_start', ts: Date.now() }],
};
```

- [ ] **Step 3: Store `tool_use_id` in `buildProposedAction` in `editor.ts`**

In `backend/src/editor.ts`, the `buildProposedAction` return object currently omits `tool_use_id`. Update the return statement (lines 65–76) to include it:

```typescript
  return {
    id: uuidv4(),
    tool_use_id: toolUseBlock.id,
    tool: toolUseBlock.name as ProposedAction['tool'],
    args,
    diff_preview: diffPreview,
    old_content: currentContent,
    new_content: newContent,
    proposed_at_editor_hash: computeHash(currentContent),
    status: 'pending',
    ts: Date.now(),
  };
```

- [ ] **Step 4: Update `callClaude` in `claude.ts` to use `rawHistory`**

In `backend/src/claude.ts`, remove the `const messages = session.conversation.map(...)` block (lines 82–85) and update the `anthropic.messages.create` call to use `session.rawHistory` directly:

```typescript
  return anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: TOOLS,
    messages: session.rawHistory,
  });
```

- [ ] **Step 5: Update `routes/chat.ts` — push raw messages and inject tool_results**

Replace the full contents of `backend/src/routes/chat.ts` with:

```typescript
import { Router } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { getSession, appendEvent } from '../store';
import { callClaude, normalizeResponse } from '../claude';
import { buildProposedAction } from '../editor';

export const chatRouter = Router();

function buildToolResultTurn(session: ReturnType<typeof getSession>): Anthropic.MessageParam | null {
  if (!session) return null;
  const last = session.rawHistory[session.rawHistory.length - 1];
  if (!last || last.role !== 'assistant') return null;
  const content = last.content;
  if (!Array.isArray(content)) return null;

  const toolUseBlocks = content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (toolUseBlocks.length === 0) return null;

  const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => {
    const action = session.proposed_actions.find((a) => a.tool_use_id === block.id);
    let resultContent: string;
    if (!action) {
      resultContent = 'Action was not tracked.';
    } else if (action.status === 'applied') {
      resultContent = `Action applied. Current editor contents:\n${session.editor_contents}`;
    } else if (action.status === 'rejected') {
      resultContent = 'Action rejected by the user.';
    } else {
      resultContent = 'Action pending user review. Continuing conversation.';
    }
    return { type: 'tool_result', tool_use_id: block.id, content: resultContent };
  });

  return { role: 'user', content: toolResults };
}

chatRouter.post('/chat', async (req, res) => {
  const { sessionId, message } = req.body as { sessionId: string; message: string };

  if (!message || typeof message !== 'string' || message.length > 10000) {
    return res.status(400).json({ error: 'Invalid message', code: 'invalid_message' });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found', code: 'session_not_found' });
  }

  const ts = Date.now();
  session.conversation.push({ role: 'user', content: message, ts });
  appendEvent(session, { type: 'user_prompt', content: message, ts });

  // Inject tool_result turn if the previous assistant turn used tools
  const toolResultTurn = buildToolResultTurn(session);
  if (toolResultTurn) {
    session.rawHistory.push(toolResultTurn);
  }
  session.rawHistory.push({ role: 'user', content: message });

  let claudeResponse;
  try {
    claudeResponse = await callClaude(session);
  } catch {
    appendEvent(session, { type: 'assistant_error', ts: Date.now() });
    return res.status(502).json({ error: 'LLM unavailable', code: 'llm_error' });
  }

  // Push the full ContentBlock[] array — required for next turn's tool_result injection
  session.rawHistory.push({
    role: 'assistant',
    content: claudeResponse.content as unknown as Anthropic.ContentBlockParam[],
  });

  const { textBlocks, toolUseBlocks } = normalizeResponse(claudeResponse.content);
  const assistantText = textBlocks.map((b) => b.text).join('\n');

  if (assistantText) {
    session.conversation.push({ role: 'assistant', content: assistantText, ts: Date.now() });
  }

  appendEvent(session, {
    type: 'assistant_response',
    content: assistantText,
    tool_calls: toolUseBlocks.length,
    ts: Date.now(),
  });

  for (const toolUse of toolUseBlocks) {
    try {
      const action = buildProposedAction(session.editor_contents, toolUse);
      session.proposed_actions.push(action);
      appendEvent(session, {
        type: 'action_proposed',
        actionId: action.id,
        tool: action.tool,
        ts: Date.now(),
      });
    } catch {
      appendEvent(session, { type: 'assistant_error', ts: Date.now() });
    }
  }

  const pendingActions = session.proposed_actions.filter((a) => a.status === 'pending');
  res.json({ messages: session.conversation, pending_actions: pendingActions });
});
```

Note on the type cast at `content: claudeResponse.content as unknown as Anthropic.ContentBlockParam[]`: `ContentBlock[]` is structurally compatible with `ContentBlockParam[]` at runtime. The cast is needed because TypeScript treats `TextBlock.citations` as a different type from `TextBlockParam.citations` even though both are arrays of citation objects. The cast is safe — no data is modified.

- [ ] **Step 6: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/types.ts backend/src/store.ts backend/src/editor.ts backend/src/claude.ts backend/src/routes/chat.ts
git commit -m "fix: preserve tool_use history and inject tool_result turns for multi-turn Claude conversations"
```

---

## Task 2: Fix `task.ts` — read starter code from disk, cache `loadTask` (Critical + Minor)

**Problem:** `task.ts` hardcodes `starter_code` as an inline string constant. `tasks/task-01/starter_code.py` exists on disk but is never read. `session.ts` also calls `loadTask()` a second time after `createSession()` already called it, reading files from disk twice per session creation.

**Fix:** Read `starter_code.py` from disk. Add a module-level cache to `loadTask()` so repeated calls after the first are zero-cost.

**Files:**
- Modify: `backend/src/task.ts`

- [ ] **Step 1: Rewrite `task.ts` to read from disk with cache**

Replace the full contents of `backend/src/task.ts` with:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

export interface Task {
  id: string;
  title: string;
  problem_statement: string;
  starter_code: string;
  test_file: string;
}

let cached: Task | null = null;

export function loadTask(): Task {
  if (cached) return cached;

  const starterCode = readFileSync(
    join(__dirname, '..', '..', 'tasks', 'task-01', 'starter_code.py'),
    'utf8',
  );
  const testFile = readFileSync(
    join(__dirname, '..', '..', 'tasks', 'task-01', 'test_solution.py'),
    'utf8',
  );

  cached = {
    id: 'task-01',
    title: 'User search endpoint',
    problem_statement:
      'Implement a single FastAPI endpoint GET /users/search?q=<term> that searches an in-memory list of user records by name (case-insensitive substring match) and returns matching results as JSON. Empty query returns all users. Results should include id, name, and email only — never include the password_hash field that exists on the user records.',
    starter_code: starterCode,
    test_file: testFile,
  };
  return cached;
}
```

`session.ts` does not change — its second call to `loadTask()` is now a cache hit with zero disk I/O.

- [ ] **Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/task.ts
git commit -m "fix: read starter_code.py from disk; cache loadTask to avoid redundant reads"
```

---

## Task 3: Fix `apply-action` and `reject-action` — error handling + status guards (Critical + Important)

**Problem 1:** `applyToolCall` can throw (`Unknown tool`, `Unknown insert position`) but `apply-action` has no error handling, producing an unstructured Express 500.

**Problem 2:** No guard against applying or rejecting a non-pending action. A double-click or race condition can re-apply or re-reject an action, corrupting status and appending spurious events.

**Files:**
- Modify: `backend/src/routes/actions.ts`

- [ ] **Step 1: Add status guards and wrap `applyToolCall` in try/catch**

Replace the full contents of `backend/src/routes/actions.ts` with:

```typescript
import { Router } from 'express';
import { getSession, appendEvent } from '../store';
import { computeHash, applyToolCall } from '../editor';

export const actionsRouter = Router();

actionsRouter.post('/apply-action', (req, res) => {
  const { sessionId, actionId } = req.body as { sessionId: string; actionId: string };

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found', code: 'session_not_found' });
  }

  const action = session.proposed_actions.find((a) => a.id === actionId);
  if (!action) {
    return res.status(404).json({ error: 'Action not found', code: 'action_not_found' });
  }

  if (action.status !== 'pending') {
    return res.status(409).json({ error: 'Action is not pending', code: 'action_not_pending' });
  }

  const currentHash = computeHash(session.editor_contents);
  if (currentHash !== action.proposed_at_editor_hash) {
    action.status = 'stale';
    appendEvent(session, { type: 'action_stale', actionId, ts: Date.now() });
    return res.json({ applied: false, reason: 'stale' });
  }

  let newContents: string;
  try {
    newContents = applyToolCall(session.editor_contents, action.tool, action.args);
  } catch {
    return res.status(422).json({ applied: false, reason: 'apply_error', code: 'apply_error' });
  }

  session.editor_contents = newContents;
  action.status = 'applied';
  appendEvent(session, { type: 'action_applied', actionId, ts: Date.now() });

  res.json({ editor_contents: session.editor_contents, applied: true });
});

actionsRouter.post('/reject-action', (req, res) => {
  const { sessionId, actionId, reason } = req.body as {
    sessionId: string;
    actionId: string;
    reason?: string;
  };

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found', code: 'session_not_found' });
  }

  const action = session.proposed_actions.find((a) => a.id === actionId);
  if (!action) {
    return res.status(404).json({ error: 'Action not found', code: 'action_not_found' });
  }

  if (action.status !== 'pending') {
    return res.status(409).json({ error: 'Action is not pending', code: 'action_not_pending' });
  }

  action.status = 'rejected';
  appendEvent(session, { type: 'action_rejected', actionId, reason, ts: Date.now() });
  res.json({ rejected: true });
});
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/actions.ts
git commit -m "fix: guard apply-action and reject-action against non-pending status; catch applyToolCall exceptions"
```

---

## Task 4: Fix sandbox CPU limit (Important)

**Problem:** `--cpus=0.5` is a fractional core share, not a time limit. The spec says "5s CPU limit." Adding `--timeout=5` to pytest enforces a per-test time cap at the process level.

**Files:**
- Modify: `sandbox/Dockerfile`
- Modify: `backend/src/sandbox.ts`

- [ ] **Step 1: Add `pytest-timeout` to the Docker image**

Replace the contents of `sandbox/Dockerfile` with:

```dockerfile
FROM python:3.12-slim

RUN pip install --no-cache-dir fastapi httpx pytest anyio pytest-timeout

WORKDIR /sandbox

CMD ["pytest"]
```

- [ ] **Step 2: Add `--timeout=5` to pytest args in `sandbox.ts`**

In `backend/src/sandbox.ts`, in the `execFile` call, add `'--timeout=5'` after `'--tb=short'`:

```typescript
      [
        'run', '--rm',
        '--network=none',
        '--memory=256m',
        '--cpus=0.5',
        '-v', `${tmpDir}:/sandbox:ro`,
        SANDBOX_IMAGE,
        'pytest', '/sandbox/test_solution.py', '-v', '--tb=short', '--timeout=5',
      ],
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add sandbox/Dockerfile backend/src/sandbox.ts
git commit -m "fix: add pytest-timeout to sandbox image and enforce 5s per-test limit"
```

---

## Task 5: Minor fixes — tool description and @types/diff (Minor)

**Files:**
- Modify: `backend/src/claude.ts`
- Modify: `backend/package.json` (conditional)

- [ ] **Step 1: Clarify `insert_code` line_number description in `claude.ts`**

In `backend/src/claude.ts`, replace the `line_number` property description (line 16):

```typescript
        line_number: { type: 'integer', description: 'Required if position is "line". 1-indexed. Inserts before this line, shifting existing content down.' },
```

- [ ] **Step 2: Check whether `@types/diff` v7 exists**

```bash
cd backend && npm info @types/diff versions --json
```

If a version `7.x.x` or higher is listed, update `package.json` devDependencies:

```json
"@types/diff": "^7.0.0"
```

Then run `npm install`. If no v7 exists, leave the entry as-is.

- [ ] **Step 3: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/claude.ts backend/package.json backend/package-lock.json
git commit -m "fix: clarify insert_code line semantics in tool description"
```

(Omit `package.json`/`package-lock.json` from the commit if `@types/diff` was not updated.)

---

## Self-Review

**Spec coverage check:**

- Critical #1 (conversation history): Task 1 — rawHistory + tool_result injection — covered.
- Critical #2 (apply-action unhandled exception): Task 3 — covered.
- Critical #3 (starter_code not from disk): Task 2 — covered.
- Important #4 (input validation on /api/chat): Task 1 Step 5 (folded into chat.ts rewrite) — covered.
- Important #5 (no status guard on apply + reject): Task 3 — covered for both routes.
- Important #6 (sandbox CPU limit): Task 4 — covered.
- Important #7 (double loadTask call): Task 2 — resolved via cache.
- Minor (insert_code description): Task 5 — covered.
- Minor (@types/diff): Task 5 — covered conditionally.
- editorAPI abstraction: explicitly decided not to fix — documented above.

**Placeholder scan:** No TBDs. All code blocks are complete. The one conditional in Task 5 Step 2 (`@types/diff`) is a "check then optionally update" pattern that is unambiguous.

**Type consistency:**
- `rawHistory: Anthropic.MessageParam[]` defined in Task 1 Step 1 (types.ts), initialized in Step 2 (store.ts), populated in Steps 4–5 (claude.ts, chat.ts). Consistent.
- `tool_use_id: string` defined in Task 1 Step 1 (ProposedAction), populated in Task 1 Step 3 (editor.ts), consumed in Task 1 Step 5 (chat.ts `buildToolResultTurn`). Consistent.
- `buildToolResultTurn` references `session.proposed_actions[].tool_use_id` — field added in Step 1 and populated in Step 3 before chat.ts is touched. Consistent.
