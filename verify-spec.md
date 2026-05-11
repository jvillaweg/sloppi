# Specification Verification

## File: backend/src/types.ts
Required exports:
✓ ChatMessage interface
  - role: 'user' | 'assistant'
  - content: string
  - ts: number

✓ ProposedAction interface
  - id: string
  - tool: 'insert_code' | 'replace_block' | 'delete_block' | 'replace_file'
  - args: Record<string, unknown>
  - diff_preview: string
  - old_content: string
  - new_content: string
  - proposed_at_editor_hash: string
  - status: 'pending' | 'applied' | 'rejected' | 'stale'
  - ts: number

✓ AppEvent (discriminated union with 9 variants)
  1. session_start: { type: 'session_start'; ts: number }
  2. user_prompt: { type: 'user_prompt'; content: string; ts: number }
  3. assistant_response: { type: 'assistant_response'; content: string; tool_calls: number; ts: number }
  4. assistant_error: { type: 'assistant_error'; ts: number }
  5. action_proposed: { type: 'action_proposed'; actionId: string; tool: string; ts: number }
  6. action_applied: { type: 'action_applied'; actionId: string; ts: number }
  7. action_rejected: { type: 'action_rejected'; actionId: string; reason?: string; ts: number }
  8. action_stale: { type: 'action_stale'; actionId: string; ts: number }
  9. tests_run: { type: 'tests_run'; passed: boolean; duration_ms: number; ts: number }

✓ SessionState interface
  - sessionId: string
  - taskId: string
  - editor_contents: string
  - conversation: ChatMessage[]
  - proposed_actions: ProposedAction[]
  - events: AppEvent[]

✓ TestResult interface
  - stdout: string
  - stderr: string
  - exit_code: number
  - duration_ms: number

## File: backend/src/task.ts
✓ Task interface exported
✓ loadTask() function that:
  - Reads test_solution.py from correct path: join(__dirname, '..', '..', 'tasks', 'task-01', 'test_solution.py')
  - Returns Task object

## File: backend/src/store.ts
✓ In-memory Map<string, SessionState>
✓ createSession() function
✓ getSession() function
✓ appendEvent() function

## TypeScript Compilation
✓ tsc --noEmit passes without errors
