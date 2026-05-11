import { execFile } from 'child_process';
import { mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { TestResult } from './types';

const TEST_FILE_SRC = join(__dirname, '..', '..', 'tasks', 'task-01', 'test_solution.py');
const SANDBOX_IMAGE = 'sloppi-sandbox:latest';

export function runTests(editorContents: string): Promise<TestResult> {
  if (process.env.MOCK_SANDBOX === 'true') {
    return Promise.resolve({
      stdout: '4 passed in 0.10s (mock)',
      stderr: '',
      exit_code: 0,
      duration_ms: 0,
    });
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'sloppi-'));
  const start = Date.now();

  return new Promise<TestResult>((resolve) => {
    try {
      writeFileSync(join(tmpDir, 'solution.py'), editorContents, 'utf8');
      copyFileSync(TEST_FILE_SRC, join(tmpDir, 'test_solution.py'));
    } catch (err) {
      rmSync(tmpDir, { recursive: true, force: true });
      resolve({ stdout: '', stderr: String(err), exit_code: 1, duration_ms: Date.now() - start });
      return;
    }

    execFile(
      'docker',
      [
        'run', '--rm',
        '--network=none',
        '--memory=256m',
        '--cpus=0.5',
        '-v', `${tmpDir}:/sandbox:ro`,
        SANDBOX_IMAGE,
        'pytest', '/sandbox/test_solution.py', '-v', '--tb=short', '--timeout=5',
      ],
      { timeout: 15000 },
      (error, stdout, stderr) => {
        rmSync(tmpDir, { recursive: true, force: true });
        let exit_code = 0;
        if (error) {
          exit_code = error.killed ? 124 : (typeof error.code === 'number' ? error.code : 1);
        }
        resolve({ stdout, stderr, exit_code, duration_ms: Date.now() - start });
      },
    );
  });
}
