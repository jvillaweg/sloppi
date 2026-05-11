import { readFileSync } from 'fs';
import { join } from 'path';

export interface Task {
  id: string;
  title: string;
  problem_statement: string;
  starter_code: string;
  test_file: string;
}

let cached: Task | null = null;

export function loadTask(): Task {
  if (cached) return cached;

  const starterCode = readFileSync(
    join(__dirname, '..', '..', 'tasks', 'task-01', 'starter_code.py'),
    'utf8',
  );
  const testFile = readFileSync(
    join(__dirname, '..', '..', 'tasks', 'task-01', 'test_solution.py'),
    'utf8',
  );

  cached = {
    id: 'task-01',
    title: 'User search endpoint',
    problem_statement:
      'Implement a single FastAPI endpoint GET /users/search?q=<term> that searches an in-memory list of user records by name (case-insensitive substring match) and returns matching results as JSON. Empty query returns all users. Results should include id, name, and email only — never include the password_hash field that exists on the user records.',
    starter_code: starterCode,
    test_file: testFile,
  };
  return cached;
}
