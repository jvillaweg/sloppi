import { Router } from 'express';
import { createSession } from '../store';
import { loadTask } from '../task';

export const sessionRouter = Router();

sessionRouter.post('/session', (_req, res) => {
  const session = createSession();
  const task = loadTask();
  res.json({
    sessionId: session.sessionId,
    task: {
      id: task.id,
      title: task.title,
      problem_statement: task.problem_statement,
      starter_code: task.starter_code,
      test_file: task.test_file,
    },
  });
});
