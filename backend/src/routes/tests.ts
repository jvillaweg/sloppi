import { Router } from 'express';
import { getSession, appendEvent } from '../store';
import { runTests } from '../sandbox';

export const testsRouter = Router();

testsRouter.post('/run-tests', async (req, res) => {
  const { sessionId } = req.body as { sessionId: string };

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found', code: 'session_not_found' });
  }

  const result = await runTests(session.editor_contents);
  appendEvent(session, {
    type: 'tests_run',
    passed: result.exit_code === 0,
    duration_ms: result.duration_ms,
    ts: Date.now(),
  });

  res.json(result);
});
