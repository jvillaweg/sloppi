import { createHash } from 'crypto';
import { createPatch } from 'diff';
import { v4 as uuidv4 } from 'uuid';
import type { ProposedAction } from './types';

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function applyToolCall(
  content: string,
  tool: string,
  args: Record<string, unknown>,
): string {
  const lines = content.split('\n');

  switch (tool) {
    case 'replace_file':
      return args.code as string;

    case 'replace_block': {
      const start = (args.start_line as number) - 1;
      const end = args.end_line as number;
      return [...lines.slice(0, start), args.code as string, ...lines.slice(end)].join('\n');
    }

    case 'insert_code': {
      const pos = args.position as string;
      const code = args.code as string;
      if (pos === 'start') return code + '\n' + content;
      if (pos === 'end') return content + '\n' + code;
      if (pos === 'line') {
        const lineNum = (args.line_number as number) - 1;
        return [...lines.slice(0, lineNum), code, ...lines.slice(lineNum)].join('\n');
      }
      throw new Error(`Unknown insert position: ${pos}`);
    }

    case 'delete_block': {
      const start = (args.start_line as number) - 1;
      const end = args.end_line as number;
      return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
    }

    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

export function buildProposedAction(
  currentContent: string,
  toolUseBlock: ToolUseBlock,
): ProposedAction {
  const args = toolUseBlock.input as Record<string, unknown>;
  const newContent = applyToolCall(currentContent, toolUseBlock.name, args);
  const diffPreview = createPatch('solution.py', currentContent, newContent, '', '', { context: 3 });

  return {
    id: uuidv4(),
    tool: toolUseBlock.name as ProposedAction['tool'],
    args,
    diff_preview: diffPreview,
    old_content: currentContent,
    new_content: newContent,
    proposed_at_editor_hash: computeHash(currentContent),
    status: 'pending',
    ts: Date.now(),
  };
}
