import { useEffect, useRef, useState } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import type { ChatMessage, ProposedAction } from '../types';

interface Props {
  messages: ChatMessage[];
  actions: ProposedAction[];
  inFlight: boolean;
  onSend: (message: string) => void;
  onApply: (actionId: string) => void;
  onReject: (actionId: string) => void;
}

type TimelineItem =
  | { kind: 'message'; data: ChatMessage }
  | { kind: 'action'; data: ProposedAction };

function buildTimeline(messages: ChatMessage[], actions: ProposedAction[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...messages.map((m) => ({ kind: 'message' as const, data: m })),
    ...actions.map((a) => ({ kind: 'action' as const, data: a })),
  ];
  return items.sort((a, b) => a.data.ts - b.data.ts);
}

function StatusBadge({ status }: { status: ProposedAction['status'] }) {
  const classes: Record<ProposedAction['status'], string> = {
    pending: 'text-yellow-400',
    applied: 'text-green-400',
    rejected: 'text-red-400',
    stale: 'text-gray-500',
  };
  return <span className={`text-xs font-medium ${classes[status]}`}>{status}</span>;
}

function ActionCard({
  action,
  inFlight,
  onApply,
  onReject,
}: {
  action: ProposedAction;
  inFlight: boolean;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const explanation = (action.args as { explanation?: string }).explanation ?? '';
  const isPending = action.status === 'pending';

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden my-2">
      <div className="px-3 py-2 bg-gray-800 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-mono text-blue-400">{action.tool}</span>
          {explanation && <p className="text-xs text-gray-300 mt-0.5">{explanation}</p>}
        </div>
        <StatusBadge status={action.status} />
      </div>
      <div className="text-xs max-h-64 overflow-auto">
        <ReactDiffViewer
          oldValue={action.old_content}
          newValue={action.new_content}
          splitView={false}
          useDarkTheme
          hideLineNumbers={false}
        />
      </div>
      {isPending && (
        <div className="flex gap-2 px-3 py-2 bg-gray-900 border-t border-gray-700">
          <button
            onClick={() => onApply(action.id)}
            disabled={inFlight}
            className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => onReject(action.id)}
            disabled={inFlight}
            className="px-3 py-1 text-xs bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white rounded transition-colors"
          >
            Reject
          </button>
        </div>
      )}
      {action.status === 'stale' && (
        <p className="px-3 py-2 text-xs text-gray-500 bg-gray-900 border-t border-gray-700">
          This suggestion is stale — ask the AI again.
        </p>
      )}
    </div>
  );
}

export function ChatPane({ messages, actions, inFlight, onSend, onApply, onReject }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const timeline = buildTimeline(messages, actions);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || inFlight) return;
    setInput('');
    onSend(text);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {timeline.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-8">
            Ask the AI to implement the task.
          </p>
        )}
        {timeline.map((item, i) => {
          if (item.kind === 'message') {
            const msg = item.data;
            return (
              <div
                key={`msg-${msg.ts}-${i}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-200'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          }
          return (
            <ActionCard
              key={`action-${item.data.id}`}
              action={item.data}
              inFlight={inFlight}
              onApply={onApply}
              onReject={onReject}
            />
          );
        })}
        {inFlight && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-400">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-shrink-0 border-t border-gray-800 p-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={inFlight}
          placeholder="Ask the AI..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-500 disabled:opacity-50 focus:outline-none focus:border-gray-500"
        />
        <button
          type="submit"
          disabled={inFlight || !input.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 text-white text-sm font-medium rounded transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
