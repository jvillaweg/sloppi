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

  const currentHash = computeHash(session.editor_contents);
  if (currentHash !== action.proposed_at_editor_hash) {
    action.status = 'stale';
    appendEvent(session, { type: 'action_stale', actionId, ts: Date.now() });
    return res.json({ applied: false, reason: 'stale' });
  }

  session.editor_contents = applyToolCall(
    session.editor_contents,
    action.tool,
    action.args,
  );
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

  action.status = 'rejected';
  appendEvent(session, { type: 'action_rejected', actionId, reason, ts: Date.now() });
  res.json({ rejected: true });
});
