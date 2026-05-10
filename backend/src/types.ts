export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface ProposedAction {
  id: string;
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
  proposed_actions: ProposedAction[];
  events: AppEvent[];
}

export interface TestResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}
