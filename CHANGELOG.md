# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- `ChatPane` component — scrollable chat history with inline action cards (tool name, explanation, diff preview via `react-diff-viewer-continued`, Apply/Reject buttons, status labels for applied/rejected/stale)
- `rawHistory: Anthropic.MessageParam[]` on `SessionState` — preserves full `ContentBlock[]` arrays across turns so multi-turn tool-use conversations work correctly with the Anthropic API
- `tool_use_id: string` on `ProposedAction` — links each proposed action back to its Anthropic `tool_use` block for `tool_result` injection
- Automatic `tool_result` turn injection before each new user message when the previous assistant turn used tools; merged into the same user turn to satisfy API alternation rules
- `status !== 'pending'` guard on both `POST /api/apply-action` and `POST /api/reject-action` — returns 409 for double-apply/double-reject attempts
- `pytest-timeout` in sandbox Docker image; `--timeout=5` passed to pytest — enforces 5-second per-test limit
- `.hooks/pre-push` — blocks pushes if `CHANGELOG.md` is not updated in the commits being pushed
- `.gitignore` covering `node_modules/`, `dist/`, `.env`, `.claude/`, and local dev scripts

### Fixed
- Multi-turn conversations silently breaking after the first tool-use response (Anthropic API requires tool_use history verbatim on next call)
- Consecutive `user` turns in `rawHistory` causing API 400 errors (tool_result and user message now merged into one turn)
- `backend/src/task.ts` hardcoded starter code — now reads `tasks/task-01/starter_code.py` from disk; module-level cache prevents redundant reads
- Unhandled exception in `POST /api/apply-action` when `applyToolCall` throws — now returns 422 with structured error
- Input validation missing on `POST /api/chat` — now rejects messages over 10,000 characters

### Changed
- `insert_code` tool description clarified: `line_number` inserts *before* the given line, shifting existing content down
- `@types/diff` bumped to `^7.0.0` to match the `diff` runtime package version

---

## [0.1.0] - 2026-05-09

### Added
- Initial project scaffolding — backend (Node.js + Express + TypeScript), frontend (React 18 + Vite + Tailwind + Monaco Editor), Docker sandbox
- `POST /api/session` — creates session, loads hardcoded task-01, returns starter code
- `POST /api/chat` — forwards conversation + editor contents + tool schemas to Claude; normalises mixed text/tool-use responses
- `POST /api/apply-action` — SHA-256 staleness check; applies tool call to editor contents
- `POST /api/reject-action` — logs rejection, no editor change
- `POST /api/run-tests` — runs pytest in Docker sandbox; `MOCK_SANDBOX=true` returns hardcoded success
- `GET /api/session/:id/events` — returns full append-only event log
- Four Anthropic tools: `insert_code`, `replace_block`, `delete_block`, `replace_file`
- `EDITOR_INPUT_PERMISSION` constant driving Monaco `readOnly` and `contextmenu` options
- Custom Docker sandbox image (`python:3.12-slim` + `fastapi`, `httpx`, `pytest`, `anyio`)
- Task-01: User search endpoint (FastAPI, case-insensitive name search, password_hash exclusion test)
- CORS restricted to `http://localhost:5173`
- `MOCK_SANDBOX=true` env var support
