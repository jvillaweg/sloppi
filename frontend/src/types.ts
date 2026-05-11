export interface Task {
  id: string;
  title: string;
  problem_statement: string;
  starter_code: string;
  test_file: string;
}

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

export interface TestResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

export interface SessionResponse {
  sessionId: string;
  task: Task;
}

export interface ChatResponse {
  messages: ChatMessage[];
  pending_actions: ProposedAction[];
}

export interface ApplyResponse {
  applied: boolean;
  editor_contents?: string;
  reason?: string;
}

export interface RejectResponse {
  rejected: boolean;
}
