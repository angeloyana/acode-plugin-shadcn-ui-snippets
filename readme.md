# shadcn/ui Snippets

An unofficial autocomplete plugin for shadcn/ui Base UI imports and JSX examples. It works in both Ace and CodeMirror.

## Usage

In an editable file, type `sui-` to browse suggestions or keep typing to narrow the list.

| Trigger             | Inserts               | Files                                                        |
| ------------------- | --------------------- | ------------------------------------------------------------ |
| `sui-i-<component>` | Component imports     | `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts` |
| `sui-<component>`   | Component JSX example | `.jsx`, `.tsx`                                               |

## Examples

In `App.tsx`:

1. At the top of the file, select `sui-i-button` to insert the import:

   ```tsx
   import { Button } from '@/components/ui/button';
   ```

2. Where your component renders, select `sui-button` to insert the JSX:

   ```tsx
   <Button variant="outline">Button</Button>
   ```

## Support

Find this plugin useful? Consider buying me a coffee:

<a href="https://www.buymeacoffee.com/angeloyana" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-white.png" alt="Buy Me A Coffee" height="50">
</a>

## License

[MIT](LICENSE)
