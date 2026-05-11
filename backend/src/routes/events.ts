import { Router } from 'express';
import { getSession } from '../store';

export const eventsRouter = Router();

eventsRouter.get('/session/:sessionId/events', (req, res) => {
  const { sessionId } = req.params;
  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found', code: 'session_not_found' });
  }
  res.json({ events: session.events });
});
