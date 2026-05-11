import type * as Monaco from 'monaco-editor';

export type EditorInputPermission = 'ai_only' | 'joint' | 'manual';

export const EDITOR_INPUT_PERMISSION: EditorInputPermission = 'ai_only';

export function getMonacoOptions(): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    readOnly: EDITOR_INPUT_PERMISSION === 'ai_only',
    contextmenu: EDITOR_INPUT_PERMISSION !== 'ai_only',
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
  };
}
