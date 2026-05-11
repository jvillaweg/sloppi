import { v4 as uuidv4 } from 'uuid';
import type { SessionState, AppEvent } from './types';
import { loadTask } from './task';

const sessions = new Map<string, SessionState>();

export function createSession(): SessionState {
  const task = loadTask();
  const sessionId = uuidv4();
  const session: SessionState = {
    sessionId,
    taskId: task.id,
    editor_contents: task.starter_code,
    conversation: [],
    rawHistory: [],
    proposed_actions: [],
    events: [{ type: 'session_start', ts: Date.now() }],
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function appendEvent(session: SessionState, event: AppEvent): void {
  session.events.push(event);
}
