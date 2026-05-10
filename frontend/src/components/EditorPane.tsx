import { useEffect, useRef, useState } from 'react';
import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { getMonacoOptions } from '../editorConfig';
import type { Task, TestResult } from '../types';
import { api } from '../api';

interface Props {
  task: Task | null;
  editorContents: string;
  sessionId: string | null;
}

export function EditorPane({ task, editorContents, sessionId }: Props) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  // Imperatively update Monaco when editorContents changes (after Apply)
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== editorContents) {
      editor.setValue(editorContents);
    }
  }, [editorContents]);

  const runTests = async () => {
    if (!sessionId) return;
    setRunning(true);
    setTestError(null);
    try {
      const result = await api.runTests(sessionId);
      setTestResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test run failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Task description header */}
      <div
        className={`flex-shrink-0 border-b border-gray-800 overflow-hidden ${
          collapsed ? 'h-10' : ''
        }`}
      >
        <div
          className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-gray-900 select-none"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="font-semibold text-sm text-gray-200">{task?.title}</span>
          <span className="text-gray-500 text-xs">{collapsed ? '▼' : '▲'}</span>
        </div>
        {!collapsed && (
          <p className="px-4 pb-3 text-sm text-gray-400 leading-relaxed max-h-36 overflow-y-auto">
            {task?.problem_statement}
          </p>
        )}
      </div>

      {/* Monaco editor — read-only enforced via getMonacoOptions() */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          defaultLanguage="python"
          defaultValue={editorContents}
          theme="vs-dark"
          options={getMonacoOptions()}
          onMount={handleMount}
        />
      </div>

      {/* Run Tests */}
      <div className="flex-shrink-0 border-t border-gray-800 p-3 space-y-2">
        <button
          onClick={runTests}
          disabled={running}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 text-white text-sm font-medium rounded transition-colors"
        >
          {running ? 'Running tests...' : 'Run Tests'}
        </button>

        {testResult && (
          <div className="rounded bg-gray-900 p-3 text-xs font-mono">
            <div className={testResult.exit_code === 0 ? 'text-green-400' : 'text-red-400'}>
              {testResult.exit_code === 0 ? '✓ All tests passed' : '✗ Tests failed'}
              {testResult.duration_ms > 0 && ` (${testResult.duration_ms}ms)`}
            </div>
            {testResult.stdout && (
              <pre className="mt-2 text-gray-300 whitespace-pre-wrap overflow-auto max-h-32">
                {testResult.stdout}
              </pre>
            )}
            {testResult.stderr && (
              <pre className="mt-1 text-red-400 whitespace-pre-wrap overflow-auto max-h-20">
                {testResult.stderr}
              </pre>
            )}
          </div>
        )}

        {testError && (
          <div className="rounded bg-gray-900 p-3 text-xs text-red-400">
            {testError}
          </div>
        )}
      </div>
    </div>
  );
}
