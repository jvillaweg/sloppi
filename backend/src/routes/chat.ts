import { Router } from 'express';
import { getSession, appendEvent } from '../store';
import { callClaude, normalizeResponse } from '../claude';
import { buildProposedAction } from '../editor';

export const chatRouter = Router();

chatRouter.post('/chat', async (req, res) => {
  const { sessionId, message } = req.body as { sessionId: string; message: string };

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found', code: 'session_not_found' });
  }

  const ts = Date.now();
  session.conversation.push({ role: 'user', content: message, ts });
  appendEvent(session, { type: 'user_prompt', content: message, ts });

  let claudeResponse;
  try {
    claudeResponse = await callClaude(session);
  } catch {
    appendEvent(session, { type: 'assistant_error', ts: Date.now() });
    return res.status(502).json({ error: 'LLM unavailable', code: 'llm_error' });
  }

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
