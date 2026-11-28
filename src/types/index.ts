export type Snippet = {
  type: string;
  name: string;
  description: string;
  content: string;
  source: string;
};

export type CMView = InstanceType<Acode.CodeMirrorNamespace['view']['EditorView']>;
export type CMContext = InstanceType<
  Acode.CodeMirrorNamespace['autocomplete']['CompletionContext']
>;
export type CMState = CMView['state'];
