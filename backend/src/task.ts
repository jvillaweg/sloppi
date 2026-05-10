import { readFileSync } from 'fs';
import { join } from 'path';

export interface Task {
  id: string;
  title: string;
  problem_statement: string;
  starter_code: string;
  test_file: string;
}

const STARTER_CODE = `from fastapi import FastAPI
from typing import Optional

app = FastAPI()

USERS = [
    {"id": 1, "name": "Alice Smith", "email": "alice@example.com", "password_hash": "abc123"},
    {"id": 2, "name": "Bob Jones", "email": "bob@example.com", "password_hash": "def456"},
    {"id": 3, "name": "Carol White", "email": "carol@example.com", "password_hash": "ghi789"},
    {"id": 4, "name": "Dave Brown", "email": "dave@example.com", "password_hash": "jkl012"},
    {"id": 5, "name": "Eve Davis", "email": "eve@example.com", "password_hash": "mno345"},
    {"id": 6, "name": "Frank Wilson", "email": "frank@example.com", "password_hash": "pqr678"},
]


@app.get("/users/search")
def search_users(q: Optional[str] = ""):
    # TODO: implement search logic
    pass
`;

export function loadTask(): Task {
  const testFile = readFileSync(
    join(__dirname, '..', '..', 'tasks', 'task-01', 'test_solution.py'),
    'utf8',
  );

  return {
    id: 'task-01',
    title: 'User search endpoint',
    problem_statement:
      'Implement a single FastAPI endpoint GET /users/search?q=<term> that searches an in-memory list of user records by name (case-insensitive substring match) and returns matching results as JSON. Empty query returns all users. Results should include id, name, and email only — never include the password_hash field that exists on the user records.',
    starter_code: STARTER_CODE,
    test_file: testFile,
  };
}
