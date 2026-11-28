import asyncFs from 'node:fs/promises';

function extractDescription(markdown) {
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return '';

  const line = fm[1].match(/^description:\s*(.*)$/m);
  if (!line) return '';

  return line[1].trim();
}

function extractSnippetContent(markdown) {
  const section = markdown.match(/^## Usage\s*\n(.*?)(?=^## |(?![\s\S]))/ms);

  const usageText = section?.[1] ?? '';

  const fence = /^```(?<lang>\w+)?[ \t]*(?<meta>[^\n]*)\n(?<code>.*?)^```/gms;

  const codes = [...usageText.matchAll(fence)].map((m) => m.groups.code.replace(/\n+$/, ''));

  const [importStatement, component] = codes;

  return {
    importStatement,
    component,
  };
}

async function generateSnippet(name, docsUrl) {
  const markdownUrl = docsUrl + '.md';
  const res = await fetch(markdownUrl);
  const markdown = await res.text();

  const description = extractDescription(markdown);
  const { importStatement, component } = extractSnippetContent(markdown);

  return [
    { type: 'import', name, description, content: importStatement, source: docsUrl },
    { type: 'component', name, description, content: component, source: docsUrl },
  ];
}

async function getBaseUISnippets() {
  const res = await fetch('https://ui.shadcn.com/r/styles/base-nova/registry.json');
  const registry = await res.json();

  const skipComponents = ['form', 'chart', 'sidebar'];
  const promises = registry.items
    .filter((item) => item.type === 'registry:ui' && !skipComponents.includes(item.name))
    .map((item) => {
      const name = item.name;
      const docsUrl =
        item.meta?.links?.docs ?? `https://ui.shadcn.com/docs/components/base/${name}`;
      return generateSnippet(name, docsUrl);
    });

  return (await Promise.all(promises)).flat();
}

async function getVariantsSnippets() {
  const variantsPath = new URL('../snippets/variants.json', import.meta.url);
  const variants = await asyncFs.readFile(variantsPath, 'utf8');
  return JSON.parse(variants);
}

async function run() {
  const snippets = [...(await getBaseUISnippets()), ...(await getVariantsSnippets())].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const snippetsPath = new URL('../src/snippets.json', import.meta.url);
  await asyncFs.writeFile(snippetsPath, JSON.stringify(snippets, null, 2));
  console.log('Snippets generated!');
}

run();
