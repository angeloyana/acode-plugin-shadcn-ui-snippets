export type Snippet = { imports: string; jsx: string; description?: string };

export type CMView = InstanceType<Acode.CodeMirrorNamespace['view']['EditorView']>;
export type CMContext = InstanceType<
  Acode.CodeMirrorNamespace['autocomplete']['CompletionContext']
>;
export type CMState = CMView['state'];
