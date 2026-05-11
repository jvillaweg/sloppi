import Anthropic from '@anthropic-ai/sdk';
import type { SessionState } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'insert_code',
    description: 'Insert new code into the editor at a specified position.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'The code to insert' },
        position: { type: 'string', enum: ['start', 'end', 'line'], description: 'Where to insert' },
        line_number: { type: 'integer', description: 'Required if position is "line". 1-indexed.' },
        explanation: { type: 'string', description: '1-sentence rationale shown to user' },
      },
      required: ['code', 'position', 'explanation'],
    },
  },
  {
    name: 'replace_block',
    description: 'Replace lines start_line through end_line (inclusive) with new code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_line: { type: 'integer', description: '1-indexed inclusive' },
        end_line: { type: 'integer', description: '1-indexed inclusive' },
        code: { type: 'string' },
        explanation: { type: 'string' },
      },
      required: ['start_line', 'end_line', 'code', 'explanation'],
    },
  },
  {
    name: 'delete_block',
    description: 'Delete lines start_line through end_line (inclusive).',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_line: { type: 'integer' },
        end_line: { type: 'integer' },
        explanation: { type: 'string' },
      },
      required: ['start_line', 'end_line', 'explanation'],
    },
  },
  {
    name: 'replace_file',
    description: 'Replace the entire editor contents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string' },
        explanation: { type: 'string' },
      },
      required: ['code', 'explanation'],
    },
  },
];

export function normalizeResponse(blocks: Anthropic.ContentBlock[]): {
  textBlocks: Anthropic.TextBlock[];
  toolUseBlocks: Anthropic.ToolUseBlock[];
} {
  const textBlocks = blocks.filter((b): b is Anthropic.TextBlock => b.type === 'text');
  const toolUseBlocks = blocks.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  return { textBlocks, toolUseBlocks };
}

export async function callClaude(session: SessionState): Promise<Anthropic.Message> {
  const systemPrompt = `You are a coding assistant helping a developer implement a FastAPI endpoint.

Current editor contents (solution.py):
\`\`\`python
${session.editor_contents}
\`\`\`

Use the provided tools to suggest code modifications. Always include a brief explanation for each change.`;

  return anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: TOOLS,
    messages: session.rawHistory,
  });
}
