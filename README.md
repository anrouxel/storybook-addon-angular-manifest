# Storybook Addon Angular Manifest

[![npm version](https://img.shields.io/npm/v/@anrouxel/storybook-addon-angular-manifest.svg)](https://www.npmjs.com/package/@anrouxel/storybook-addon-angular-manifest)
[![license](https://img.shields.io/npm/l/@anrouxel/storybook-addon-angular-manifest.svg)](./LICENSE.md)

A Storybook addon that builds an **Angular component manifest** from your stories and [Compodoc](https://compodoc.app/) documentation. It plugs into Storybook's `experimental_manifests` API so tools like AI assistants and the [MCP](https://modelcontextprotocol.io/) server can understand your Angular component library: inputs, outputs, selectors, descriptions and ready-to-use template snippets.

## Features

- **Compodoc integration** — reads `documentation.json` and matches each story's component to its Compodoc entry to extract inputs, outputs, selector, standalone flag and change detection strategy.
- **Angular template snippets** — generates a `<component ...>` snippet per story from the component's selector and args, including one snippet per selector variant (e.g. `button[lib-btn], a[lib-btn]`).
- **JSDoc tags** — parses `@summary`, `@describe`/`@desc` and other JSDoc tags from the story's `meta` or the story export itself.
- **`@useTemplate` opt-in** — use the story's own `render` template as the snippet instead of the generated one.
- **Import statement resolution** — infers the import specifier for each component, preferring the nearest `package.json` name when the component belongs to a published package.
- **Works with `@storybook/angular` and `@storybook/angular-vite`.**

## Requirements

- Storybook `10.5.0` or later, with `experimental_manifests` support.
- [Compodoc](https://compodoc.app/) documentation generated for your Angular project. The easiest way is to enable it in your `angular.json` build target:

  ```json
  {
    "options": {
      "compodoc": true
    }
  }
  ```

  This produces a `documentation.json` file that the addon looks for at `documentation.json` or `.compodoc/documentation.json` relative to your Storybook working directory before Storybook starts.

  Alternatively, generate it manually:

  ```bash
  npx compodoc -p tsconfig.json
  ```

## Installation

```bash
npm install --save-dev @anrouxel/storybook-addon-angular-manifest
# or
pnpm add -D @anrouxel/storybook-addon-angular-manifest
# or
yarn add -D @anrouxel/storybook-addon-angular-manifest
```

Then register it in `.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/angular-vite';

const config: StorybookConfig = {
  framework: '@storybook/angular-vite',
  addons: ['@anrouxel/storybook-addon-angular-manifest'],
  // ...
};

export default config;
```

## How it works

For every story indexed by Storybook, the addon:

1. Resolves the story's `meta.component` and its import declaration to find the Angular component/directive class.
2. Looks it up in the Compodoc `documentation.json` (components, directives, pipes, injectables and classes are all searched).
3. Builds an Angular template snippet from the component's selector, its `inputsClass`/`outputsClass`, and the story's `args` — statically extracted from the story file's AST.
4. Extracts JSDoc metadata (`description`, `summary`, custom tags) from the story or component comment.
5. Assembles everything into a manifest entry served through Storybook's `experimental_manifests` mechanism.

When a component can't be resolved or isn't found in the Compodoc output, the entry still appears in the manifest with an `error` field explaining why (e.g. missing `meta.component`, or the class not covered by your `tsconfig.json`).

### Example output

Given this component and story:

```ts
@Component({
  selector: 'app-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<button [disabled]="disabled">{{ label }}</button>',
})
export class ButtonComponent {
  /** Text displayed inside the button. */
  @Input() label = 'Click me';
  /** When true the button is non-interactive. */
  @Input() disabled = false;
  /** Emitted when the user clicks the button. */
  @Output() clicked = new EventEmitter<void>();
}
```

```ts
export const Primary: StoryObj<ButtonComponent> = {
  args: { label: 'Click me', disabled: false },
};
```

the addon generates a manifest entry roughly like:

```json
{
  "id": "components-button--primary",
  "name": "ButtonComponent",
  "path": "./src/button/button.stories.ts",
  "import": "import { ButtonComponent } from \"./button.component\";",
  "selector": "app-button",
  "standalone": true,
  "changeDetection": "ChangeDetectionStrategy.OnPush",
  "compodoc": {
    "name": "ButtonComponent",
    "type": "component",
    "selector": "app-button",
    "standalone": true,
    "changeDetection": "ChangeDetectionStrategy.OnPush",
    "inputs": [
      { "name": "label", "type": "string", "optional": true, "defaultValue": "'Click me'", "description": "Text displayed inside the button." },
      { "name": "disabled", "type": "boolean", "optional": true, "defaultValue": "false", "description": "When true the button is non-interactive." }
    ],
    "outputs": [
      { "name": "clicked", "type": "EventEmitter<void>", "description": "Emitted when the user clicks the button." }
    ]
  },
  "stories": [
    {
      "id": "components-button--primary",
      "name": "Primary",
      "snippet": "<app-button label=\"Click me\" [disabled]=\"false\"></app-button>",
      "snippets": ["<app-button label=\"Click me\" [disabled]=\"false\"></app-button>"]
    }
  ]
}
```

### Opting out of generated snippets

If a story's `render` function already returns the exact template you want exposed, tag it with `@useTemplate` and the addon will use that instead of generating one from the selector:

```ts
/**
 * Uses the raw render template instead of Compodoc snippet.
 * @useTemplate
 */
export const CustomTemplate: StoryObj<ButtonComponent> = {
  render: (_args) => ({
    template: `<app-button label="custom template"></app-button>`,
  }),
};
```

## API

The package also exposes its manifest type for consumers building on top of it:

```ts
import type { AngularComponentManifest } from '@anrouxel/storybook-addon-angular-manifest';
```

## Troubleshooting

**"No Compodoc documentation.json found"** — enable `compodoc: true` in your `angular.json` build options, or run `npx compodoc -p tsconfig.json` before starting Storybook.

**"We could not detect the component from your story file"** — make sure your story's default export sets `component` (e.g. `meta.component = ButtonComponent`).

**"\<Component\> was not found in the Compodoc documentation"** — check that the component's source file is included in the `tsconfig.json` used to generate Compodoc's documentation.

## Contributing

```bash
pnpm install
pnpm build       # build the addon
pnpm test        # run the test suite
pnpm check       # lint with Biome
```

## License

[MIT](./LICENSE.md) © [Antonin Rouxel](https://github.com/anrouxel)
