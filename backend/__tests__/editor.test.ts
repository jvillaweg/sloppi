import { computeHash, applyToolCall, buildProposedAction } from '../src/editor';

const SAMPLE = 'line1\nline2\nline3\nline4\nline5';

describe('computeHash', () => {
  it('returns a 64-char hex string', () => {
    expect(computeHash('hello')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeHash('hello')).toBe(computeHash('hello'));
  });

  it('differs for different content', () => {
    expect(computeHash('hello')).not.toBe(computeHash('world'));
  });
});

describe('applyToolCall — replace_file', () => {
  it('replaces entire content', () => {
    const result = applyToolCall(SAMPLE, 'replace_file', { code: 'new content', explanation: '' });
    expect(result).toBe('new content');
  });
});

describe('applyToolCall — replace_block', () => {
  it('replaces a range of lines (1-indexed, inclusive)', () => {
    const result = applyToolCall(SAMPLE, 'replace_block', {
      start_line: 2,
      end_line: 3,
      code: 'replaced',
      explanation: '',
    });
    expect(result).toBe('line1\nreplaced\nline4\nline5');
  });

  it('replaces a single line', () => {
    const result = applyToolCall(SAMPLE, 'replace_block', {
      start_line: 1,
      end_line: 1,
      code: 'NEW',
      explanation: '',
    });
    expect(result).toBe('NEW\nline2\nline3\nline4\nline5');
  });
});

describe('applyToolCall — insert_code', () => {
  it('inserts at start', () => {
    const result = applyToolCall('a\nb', 'insert_code', {
      code: 'x',
      position: 'start',
      explanation: '',
    });
    expect(result).toBe('x\na\nb');
  });

  it('inserts at end', () => {
    const result = applyToolCall('a\nb', 'insert_code', {
      code: 'x',
      position: 'end',
      explanation: '',
    });
    expect(result).toBe('a\nb\nx');
  });

  it('inserts before the given line number (1-indexed)', () => {
    const result = applyToolCall(SAMPLE, 'insert_code', {
      code: 'inserted',
      position: 'line',
      line_number: 3,
      explanation: '',
    });
    expect(result).toBe('line1\nline2\ninserted\nline3\nline4\nline5');
  });
});

describe('applyToolCall — delete_block', () => {
  it('deletes a range of lines', () => {
    const result = applyToolCall(SAMPLE, 'delete_block', {
      start_line: 2,
      end_line: 4,
      explanation: '',
    });
    expect(result).toBe('line1\nline5');
  });
});

describe('applyToolCall — unknown tool', () => {
  it('throws for unknown tool', () => {
    expect(() => applyToolCall(SAMPLE, 'unknown_tool', {})).toThrow('Unknown tool');
  });
});

describe('buildProposedAction', () => {
  it('computes hash, old_content, new_content, and diff_preview', () => {
    const action = buildProposedAction('old content', {
      type: 'tool_use',
      id: 'test-id',
      name: 'replace_file',
      input: { code: 'new content', explanation: 'test replacement' },
    });

    expect(action.proposed_at_editor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(action.old_content).toBe('old content');
    expect(action.new_content).toBe('new content');
    expect(action.diff_preview).toContain('solution.py');
    expect(action.status).toBe('pending');
    expect(action.tool).toBe('replace_file');
    expect(action.args).toEqual({ code: 'new content', explanation: 'test replacement' });
  });
});
