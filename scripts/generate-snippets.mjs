import { rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const registryUrl = 'https://ui.shadcn.com/r/styles/base-nova/registry.json';
const catalogUrl = new URL('../src/snippets.json', import.meta.url);
const compilerOptions = {
  allowJs: true,
  checkJs: true,
  jsx: ts.JsxEmit.Preserve,
  lib: ['lib.es2020.d.ts'],
  noResolve: true,
  target: ts.ScriptTarget.ES2020,
};
const host = ts.createCompilerHost(compilerOptions);
const missingNameErrors = new Set([2304, 2503, 2552, 2693, 18004]);
const setupRequired = new Map([
  ['chart', 'requires a chart container and chart data'],
  ['questionnaire', 'requires questionnaire data and context'],
  ['toast', 'requires a Toaster mounted separately'],
]);

function readExamples(markdown) {
  const usage = [];
  const demos = [[]];
  let section = demos[0];
  const tokens = /^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*$|^##[ \t]+(.+)$/gm;
  for (const [, fence, info, code, heading] of markdown.matchAll(tokens)) {
    if (!fence) {
      if (heading.trim() === 'Usage') section = usage;
      else if (heading.trim() === 'Installation') section = null;
      else {
        section = [];
        demos.push(section);
      }
    } else if (section && /^(?:tsx?|jsx?)(?:\s|$)/.test(info.trim())) {
      section.push(ts.createSourceFile('example.tsx', code, ts.ScriptTarget.Latest, true));
    }
  }
  return { usage, demos };
}

function jsxText(expression, source) {
  while (expression && ts.isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  if (
    !expression ||
    !(
      ts.isJsxElement(expression) ||
      ts.isJsxSelfClosingElement(expression) ||
      ts.isJsxFragment(expression)
    )
  )
    return null;

  const start = expression.getStart(source);
  const { character } = source.getLineAndCharacterOfPosition(start);
  const indent = source.text.slice(start - character, start).match(/^\s*/)[0];
  const [first, ...rest] = expression.getText(source).split('\n');
  return [
    first,
    ...rest.map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line)),
  ].join('\n');
}

function isStandalone(imports, jsx) {
  // Some usage blocks show the permitted prop values as a placeholder.
  if (/=(["'])[\w-]+(?: \| [\w-]+)+\1/.test(jsx)) return false;
  const filename = 'snippet.jsx';
  const source = ts.createSourceFile(
    filename,
    `${imports}\nexport default (\n${jsx}\n)`,
    ts.ScriptTarget.Latest,
    true
  );
  const program = ts.createProgram([filename], compilerOptions, {
    ...host,
    getSourceFile: (name, ...args) =>
      name === filename ? source : host.getSourceFile(name, ...args),
  });
  return (
    program.getSyntacticDiagnostics(source).length === 0 &&
    !program.getSemanticDiagnostics(source).some(({ code }) => missingNameErrors.has(code))
  );
}

function findExample(blocks, name, isDemo) {
  let previousImports = [];
  for (const source of blocks) {
    if (source.parseDiagnostics.length) continue;
    const declarations = source.statements.filter(ts.isImportDeclaration);
    const expressions = source.statements.flatMap((statement) => {
      if (!isDemo && ts.isExpressionStatement(statement)) return [statement.expression];
      if (isDemo && ts.isFunctionDeclaration(statement)) {
        return (statement.body?.statements ?? [])
          .filter(ts.isReturnStatement)
          .map(({ expression }) => expression);
      }
      return [];
    });
    if (declarations.length === source.statements.length) {
      previousImports.push(...declarations);
      continue;
    }

    const imports = declarations.length ? declarations : previousImports;
    previousImports = [];
    const modules = imports.map(({ moduleSpecifier }) => moduleSpecifier.text);
    if (
      !modules.includes(`@/components/ui/${name}`) ||
      modules.some((path) => /^(?:\.|\/|#|@\/)/.test(path) && !path.startsWith('@/components/ui/'))
    )
      continue;

    const importText = imports.map((declaration) => declaration.getText()).join('\n');
    for (const expression of expressions) {
      const jsx = jsxText(expression, source);
      if (jsx && isStandalone(importText, jsx)) return { imports: importText, jsx };
    }
  }
  return null;
}

export function extractSnippet(markdown, name) {
  const { usage, demos } = readExamples(markdown.replace(/\r\n/g, '\n'));
  const example = findExample(usage, name, false);
  if (example) return example;
  for (const demo of demos) {
    const fallback = findExample(demo, name, true);
    if (fallback) return fallback;
  }
  return null;
}

export function extractDescription(markdown) {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const field = frontmatter?.match(/^description:[ \t]*([^\r\n]*)((?:\r?\n[ \t]+[^\r\n]*)*)/m);
  if (!field) return undefined;

  // shortcut: read shadcn's plain, quoted, and wrapped scalars, use a YAML parser if the format expands.
  const [, first, continuation] = field;
  const value = (/^[>|][-+]?$/.test(first.trim()) ? continuation : first + continuation)
    .replace(/\s+/g, ' ')
    .trim();
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  return value || undefined;
}

async function fetchOfficial(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok && ![404, 410].includes(response.status)) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response;
}

async function generate() {
  const registry = await fetchOfficial(registryUrl);
  if (!registry.ok) throw new Error(`Registry returned HTTP ${registry.status}`);
  const { items } = await registry.json();
  if (!Array.isArray(items)) throw new Error('The registry is missing its items array');
  const components = items
    .filter(({ type }) => type === 'registry:ui')
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const catalog = {};
  const names = new Set();

  for (const { name, meta } of components) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || names.has(name)) {
      throw new Error(`Invalid or duplicate component name: ${name}`);
    }
    names.add(name);
    if (setupRequired.has(name)) {
      console.log(`Skipped ${name}: ${setupRequired.get(name)}`);
      continue;
    }
    const docs = meta?.links?.docs;
    if (!docs) {
      console.log(`Skipped ${name}: no documentation link`);
      continue;
    }
    if (new URL(docs).origin !== 'https://ui.shadcn.com') {
      throw new Error(`Unexpected documentation URL for ${name}: ${docs}`);
    }
    const url = `${docs}.md`;
    const response = await fetchOfficial(url);
    if (!response.ok) {
      console.log(`Skipped ${name}: documentation returned HTTP ${response.status}`);
      continue;
    }
    if (!response.headers.get('content-type')?.includes('text/markdown')) {
      throw new Error(`Expected Markdown from ${url}`);
    }
    const markdown = await response.text();
    const snippet = extractSnippet(markdown, name);
    if (!snippet) {
      console.log(`Skipped ${name}: no standalone JSX example with matching imports`);
      continue;
    }
    catalog[name] = { ...snippet, description: extractDescription(markdown), source: docs };
  }

  if (!Object.keys(catalog).length) throw new Error('No snippets generated');
  const temporary = new URL(`./snippets.${process.pid}.tmp`, catalogUrl);
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, catalogUrl);
  console.log(`Generated ${Object.keys(catalog).length} of ${components.length} Base UI entries`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generate();
}
