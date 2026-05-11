import Anthropic from '@anthropic-ai/sdk';
import { normalizeResponse } from '../src/claude';

const text = (t: string): Anthropic.TextBlock => ({ type: 'text', text: t, citations: null });
const tool = (name: string): Anthropic.ToolUseBlock => ({ type: 'tool_use', id: 'x', name, input: {} });

describe('normalizeResponse', () => {
  it('separates text and tool_use blocks', () => {
    const { textBlocks, toolUseBlocks } = normalizeResponse([text('hello'), tool('replace_file')]);
    expect(textBlocks).toHaveLength(1);
    expect(toolUseBlocks).toHaveLength(1);
  });

  it('handles all text, no tools', () => {
    const { textBlocks, toolUseBlocks } = normalizeResponse([text('a'), text('b')]);
    expect(textBlocks).toHaveLength(2);
    expect(toolUseBlocks).toHaveLength(0);
  });

  it('handles all tools, no text', () => {
    const { textBlocks, toolUseBlocks } = normalizeResponse([tool('replace_file'), tool('insert_code')]);
    expect(textBlocks).toHaveLength(0);
    expect(toolUseBlocks).toHaveLength(2);
  });

  it('preserves order within each group when input is interleaved', () => {
    const { textBlocks, toolUseBlocks } = normalizeResponse([
      tool('replace_file'),
      text('first'),
      tool('insert_code'),
      text('second'),
    ]);
    expect(textBlocks[0].text).toBe('first');
    expect(textBlocks[1].text).toBe('second');
    expect(toolUseBlocks[0].name).toBe('replace_file');
    expect(toolUseBlocks[1].name).toBe('insert_code');
  });

  it('returns empty arrays for empty input', () => {
    const { textBlocks, toolUseBlocks } = normalizeResponse([]);
    expect(textBlocks).toHaveLength(0);
    expect(toolUseBlocks).toHaveLength(0);
  });
});
