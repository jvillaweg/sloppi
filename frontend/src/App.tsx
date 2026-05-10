import { useEffect, useState } from 'react';
import { api } from './api';
import type { Task, ChatMessage, ProposedAction } from './types';
import { EditorPane } from './components/EditorPane';
import { ChatPane } from './components/ChatPane';

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [editorContents, setEditorContents] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [inFlight, setInFlight] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.createSession().then(({ sessionId, task }) => {
      setSessionId(sessionId);
      setTask(task);
      setEditorContents(task.starter_code);
      setLoading(false);
    });
  }, []);

  const handleSend = async (message: string) => {
    if (!sessionId || inFlight) return;
    setInFlight(true);
    try {
      const res = await api.sendMessage(sessionId, message);
      setMessages(res.messages);
      setActions((prev) => {
        const map = new Map(prev.map((a) => [a.id, a]));
        for (const a of res.pending_actions) map.set(a.id, a);
        return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
      });
    } finally {
      setInFlight(false);
    }
  };

  const handleApply = async (actionId: string) => {
    if (!sessionId || inFlight) return;
    setInFlight(true);
    try {
      const res = await api.applyAction(sessionId, actionId);
      if (res.applied && res.editor_contents) {
        setEditorContents(res.editor_contents);
        setActions((prev) =>
          prev.map((a) => (a.id === actionId ? { ...a, status: 'applied' as const } : a)),
        );
      } else {
        setActions((prev) =>
          prev.map((a) => (a.id === actionId ? { ...a, status: 'stale' as const } : a)),
        );
      }
    } finally {
      setInFlight(false);
    }
  };

  const handleReject = async (actionId: string) => {
    if (!sessionId || inFlight) return;
    setInFlight(true);
    try {
      await api.rejectAction(sessionId, actionId);
      setActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: 'rejected' as const } : a)),
      );
    } finally {
      setInFlight(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-950 text-gray-400 text-sm">
        Loading session...
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-950 text-gray-100 overflow-hidden">
      <div className="w-3/5 flex flex-col border-r border-gray-800">
        <EditorPane
          task={task}
          editorContents={editorContents}
          sessionId={sessionId}
        />
      </div>
      <div className="w-2/5 flex flex-col">
        <ChatPane
          messages={messages}
          actions={actions}
          inFlight={inFlight}
          onSend={handleSend}
          onApply={handleApply}
          onReject={handleReject}
        />
      </div>
    </div>
  );
}
