import type {
  SessionResponse,
  ChatResponse,
  ApplyResponse,
  RejectResponse,
  TestResult,
} from './types';

const BASE = 'http://localhost:3000';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json();
  if (!res.ok) throw new Error((body as { error: string }).error ?? 'Request failed');
  return body as T;
}

export const api = {
  createSession: () =>
    fetchJSON<SessionResponse>('/api/session', { method: 'POST', body: '{}' }),

  sendMessage: (sessionId: string, message: string) =>
    fetchJSON<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId, message }),
    }),

  applyAction: (sessionId: string, actionId: string) =>
    fetchJSON<ApplyResponse>('/api/apply-action', {
      method: 'POST',
      body: JSON.stringify({ sessionId, actionId }),
    }),

  rejectAction: (sessionId: string, actionId: string, reason?: string) =>
    fetchJSON<RejectResponse>('/api/reject-action', {
      method: 'POST',
      body: JSON.stringify({ sessionId, actionId, reason }),
    }),

  runTests: (sessionId: string) =>
    fetchJSON<TestResult>('/api/run-tests', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  getEvents: (sessionId: string) =>
    fetchJSON<{ events: unknown[] }>(`/api/session/${sessionId}/events`),
};
