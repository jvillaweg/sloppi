import { runTests } from '../src/sandbox';

describe('runTests — MOCK_SANDBOX mode', () => {
  beforeAll(() => {
    process.env.MOCK_SANDBOX = 'true';
  });

  afterAll(() => {
    delete process.env.MOCK_SANDBOX;
  });

  it('resolves with exit_code 0', async () => {
    const result = await runTests('def solution(): pass');
    expect(result.exit_code).toBe(0);
  });

  it('resolves with non-empty stdout', async () => {
    const result = await runTests('def solution(): pass');
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('resolves with empty stderr', async () => {
    const result = await runTests('def solution(): pass');
    expect(result.stderr).toBe('');
  });

  it('has all required TestResult fields', async () => {
    const result = await runTests('');
    expect(typeof result.stdout).toBe('string');
    expect(typeof result.stderr).toBe('string');
    expect(typeof result.exit_code).toBe('number');
    expect(typeof result.duration_ms).toBe('number');
  });

  it('returns a Promise', () => {
    const ret = runTests('');
    expect(ret).toBeInstanceOf(Promise);
    return ret;
  });
});
