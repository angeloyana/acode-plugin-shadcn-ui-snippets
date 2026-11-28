import plugin from '../plugin.json';
import catalog from './snippets.json';
import type { CMContext, CMState, CMView, Snippet } from './types';

const snippets: Snippet[] = catalog;

const reactSnippets = snippets.map(({ type, name, content, description }) => ({
  type,
  label: type === 'import' ? `sui-i-${name}` : `sui-${name}`,
  text: content,
  description,
  detail: `shadcn/ui ${type}`,
}));

const importSnippets = reactSnippets.filter(({ type }) => type === 'import');

function completions(filename = '') {
  if (/\.[jt]sx$/i.test(filename)) return reactSnippets;
  if (/\.(?:[cm]?[jt]s)$/i.test(filename)) return importSnippets;
  return [];
}

function indentText(text: string, line: string) {
  const indent = line.match(/^[\t ]*/)?.[0] ?? '';
  return text.replace(/\n(?=\S|[\t ]+\S)/g, `\n${indent}`);
}

function startAce() {
  const editor = editorManager.editor;
  const completer: Ace.Completer = {
    getCompletions(_, session, position, prefix, callback) {
      const file = editorManager.activeFile;
      const matches =
        !file?.readOnly && prefix.startsWith('sui-')
          ? completions(file?.name).filter(({ label }) => label.startsWith(prefix))
          : [];
      const line = session.getLine(position.row);
      callback(
        null,
        matches.map(({ label, text, detail, description }) => ({
          caption: label,
          value: indentText(text, line),
          meta: detail,
          docText: description,
          score: 1000,
        }))
      );
    },
  };
  // Legacy Acode initializes its native completion list when creating the editor.
  const completers = editor.completers;
  completers.push(completer);
  return () => {
    const index = completers.indexOf(completer);
    if (index >= 0) completers.splice(index, 1);
  };
}

function startCodeMirror() {
  const { state, autocomplete } = acode.require('codemirror');
  const compartment = new state.Compartment();
  let enabled = true;

  function visibleEditors() {
    const editors = new Map<CMView, Acode.EditorFile | null>();
    if (editorManager.editor) {
      editors.set(editorManager.editor as unknown as CMView, editorManager.activeFile);
    }
    for (const { editor, activeFile } of editorManager.panes ?? []) {
      if (editor) editors.set(editor as unknown as CMView, activeFile);
    }
    return editors;
  }

  function source(context: CMContext) {
    if (!enabled || context.state.readOnly) return null;
    const match = context.matchBefore(/[\w$-]+/);
    if (!match?.text.startsWith('sui-')) return null;
    const file = context.view ? visibleEditors().get(context.view) : editorManager.activeFile;
    const options = completions(file?.name).map(({ label, text, detail, description }) => ({
      label,
      type: 'snippet',
      detail,
      info: description,
      apply(view: CMView, completion: { label: string }, from: number, to: number) {
        if (!enabled || view.state.readOnly) return;
        const line = view.state.doc.lineAt(from).text;
        view.dispatch({
          ...autocomplete.insertCompletionText(view.state, indentText(text, line), from, to),
          annotations: autocomplete.pickedCompletion.of(completion),
        });
      },
    }));
    return options.length ? { from: match.from, options, validFor: /^sui-[a-z0-9-]*$/ } : null;
  }

  const extension = compartment.of(
    state.EditorState.languageData.of(() => [{ autocomplete: source }])
  );
  function reconcile() {
    for (const [view, file] of visibleEditors()) {
      if (compartment.get(view.state) !== undefined) continue;
      view.dispatch({ effects: state.StateEffect.appendConfig.of(extension) });
      if (file?.type === 'editor') file.session = view.state as unknown as Ace.EditSession;
    }
  }

  const events = ['switch-file', 'file-loaded', 'new-file', 'update'] as const;
  for (const event of events) editorManager.on(event, reconcile);
  reconcile();
  return () => {
    enabled = false;
    for (const event of events) editorManager.off(event, reconcile);
    for (const [view, file] of visibleEditors()) {
      if (compartment.get(view.state) === undefined) continue;
      view.dispatch({ effects: compartment.reconfigure([]) });
      if (file?.type === 'editor') file.session = view.state as unknown as Ace.EditSession;
    }
    for (const file of editorManager.files) {
      if (file.type !== 'editor') continue;
      const session = file.session as unknown as CMState & { __rawState?: CMState };
      const saved = session?.__rawState ?? session;
      if (saved && compartment.get(saved) !== undefined) {
        file.session = saved.update({ effects: compartment.reconfigure([]) })
          .state as unknown as Ace.EditSession;
      }
    }
  };
}

if (window.acode) {
  let stop: (() => void) | undefined;
  acode.setPluginInit(plugin.id, () => {
    stop?.();
    stop = editorManager.isCodeMirror ? startCodeMirror() : startAce();
  });
  acode.setPluginUnmount(plugin.id, () => {
    stop?.();
    stop = undefined;
  });
}
