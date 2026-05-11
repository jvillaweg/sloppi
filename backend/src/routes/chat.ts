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

  // Inject tool_result turn if the previous assistant turn used tools.
  // Merge the user message text into the same user turn to avoid two consecutive user turns,
  // which the Anthropic API rejects.
  const toolResultTurn = buildToolResultTurn(session);
  if (toolResultTurn && Array.isArray(toolResultTurn.content)) {
    session.rawHistory.push({
      role: 'user',
      content: [
        ...(toolResultTurn.content as Anthropic.ToolResultBlockParam[]),
        { type: 'text', text: message },
      ],
    });
  } else {
    session.rawHistory.push({ role: 'user', content: message });
  }

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
