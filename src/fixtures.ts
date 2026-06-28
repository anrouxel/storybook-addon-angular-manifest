/**
 * Shared fixture data for generator tests.
 *
 * Exports a virtual filesystem (`files`) and a pre-built story index
 * (`storyIndex`) that mirror a realistic Angular library project.
 *
 * Pattern mirrors code/renderers/react/src/componentManifest/fixtures.ts
 * in the Storybook monorepo.
 */

import { dedent } from "ts-dedent";

// ---------------------------------------------------------------------------
// Virtual filesystem — passed to vol.fromJSON() in tests
// ---------------------------------------------------------------------------

export const files: Record<string, string> = {
	// ── Project root ──────────────────────────────────────────────────────────
	"./package.json": JSON.stringify({ name: "@my-org/my-lib", version: "0.0.0" }),

	// ── ButtonComponent ───────────────────────────────────────────────────────
	"./src/lib/button/button.component.ts": dedent`
    import { Component, Input, Output, EventEmitter } from '@angular/core';

    /**
     * Primary UI component for user interaction.
     */
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
  `,

	// ── LibBtnDirective — compound/attribute selector ─────────────────────────
	"./src/lib/btn/lib-btn.directive.ts": dedent`
    import { Directive, Input } from '@angular/core';

    /**
     * Attaches library button styling to any host element.
     */
    @Directive({ selector: 'button[lib-btn], a[lib-btn]', standalone: true })
    export class LibBtnDirective {
      /** Visual variant of the button. */
      @Input() variant: 'primary' | 'secondary' = 'primary';
    }
  `,

	// ── Button stories ────────────────────────────────────────────────────────
	"./src/stories/button.stories.ts": dedent`
    import type { Meta, StoryObj } from '@storybook/angular';
    import { ButtonComponent } from '../lib/button/button.component';

    const meta: Meta<ButtonComponent> = {
      title: 'Components/Button',
      component: ButtonComponent,
    };
    export default meta;

    export const Primary: StoryObj<ButtonComponent> = {
      args: { label: 'Click me', disabled: false },
    };

    export const Disabled: StoryObj<ButtonComponent> = {
      args: { label: 'Click me', disabled: true },
    };

    export const WithOutput: StoryObj<ButtonComponent> = {
      args: { clicked: undefined },
    };

    /**
     * Uses the raw render template instead of Compodoc snippet.
     * @useTemplate
     */
    export const CustomTemplate: StoryObj<ButtonComponent> = {
      render: (args) => ({ template: \`<app-button label="custom template"></app-button>\` }),
    };
  `,

	// ── LibBtn directive stories ───────────────────────────────────────────────
	"./src/stories/lib-btn.stories.ts": dedent`
    import type { Meta, StoryObj } from '@storybook/angular';
    import { LibBtnDirective } from '../lib/btn/lib-btn.directive';

    const meta: Meta<LibBtnDirective> = {
      title: 'Directives/LibBtn',
      component: LibBtnDirective,
    };
    export default meta;

    export const Primary: StoryObj<LibBtnDirective> = {};

    export const Secondary: StoryObj<LibBtnDirective> = {
      args: { variant: 'secondary' },
    };
  `,

	// ── Compodoc JSON ─────────────────────────────────────────────────────────
	"./documentation.json": JSON.stringify({
		components: [
			{
				name: "ButtonComponent",
				type: "component",
				selector: "app-button",
				standalone: true,
				changeDetection: "ChangeDetectionStrategy.OnPush",
				description: "Primary UI component for user interaction.",
				rawdescription: "Primary UI component for user interaction.",
				inputsClass: [
					{
						name: "label",
						type: "string",
						optional: true,
						defaultValue: "'Click me'",
						description: "Text displayed inside the button.",
					},
					{
						name: "disabled",
						type: "boolean",
						optional: true,
						defaultValue: "false",
						description: "When true the button is non-interactive.",
					},
				],
				outputsClass: [
					{
						name: "clicked",
						type: "EventEmitter<void>",
						optional: true,
						description: "Emitted when the user clicks the button.",
					},
				],
				propertiesClass: [],
				methodsClass: [],
			},
		],
		directives: [
			{
				name: "LibBtnDirective",
				type: "directive",
				selector: "button[lib-btn], a[lib-btn]",
				standalone: true,
				description: "Attaches library button styling to any host element.",
				rawdescription: "Attaches library button styling to any host element.",
				inputsClass: [
					{
						name: "variant",
						type: '"primary" | "secondary"',
						optional: true,
						defaultValue: "'primary'",
						description: "Visual variant of the button.",
					},
				],
				outputsClass: [],
				propertiesClass: [],
				methodsClass: [],
			},
		],
		pipes: [],
		injectables: [],
		classes: [],
	}),
};

// ---------------------------------------------------------------------------
// Story index — mirrors the Storybook index entries for these fixtures.
// Entries tagged "manifest" are eligible for manifest generation.
// ---------------------------------------------------------------------------

const MANIFEST = "manifest";
const DEV = "dev";
const TEST = "test";
const AUTODOCS = "autodocs";

export const storyIndex = {
	v: 5,
	entries: {
		// Button stories
		"components-button--primary": {
			id: "components-button--primary",
			title: "Components/Button",
			name: "Primary",
			importPath: "./src/stories/button.stories.ts",
			type: "story" as const,
			subtype: "story" as const,
			tags: [DEV, TEST, AUTODOCS, MANIFEST],
		},
		"components-button--disabled": {
			id: "components-button--disabled",
			title: "Components/Button",
			name: "Disabled",
			importPath: "./src/stories/button.stories.ts",
			type: "story" as const,
			subtype: "story" as const,
			tags: [DEV, TEST, MANIFEST],
		},
		"components-button--with-output": {
			id: "components-button--with-output",
			title: "Components/Button",
			name: "With Output",
			importPath: "./src/stories/button.stories.ts",
			type: "story" as const,
			subtype: "story" as const,
			tags: [DEV, TEST, MANIFEST],
		},
		"components-button--custom-template": {
			id: "components-button--custom-template",
			title: "Components/Button",
			name: "Custom Template",
			importPath: "./src/stories/button.stories.ts",
			type: "story" as const,
			subtype: "story" as const,
			tags: [DEV, TEST, MANIFEST],
		},
		// LibBtn directive stories
		// Note: CSF converts "Directives/LibBtn" → "directives-libbtn" (no hyphen)
		"directives-libbtn--primary": {
			id: "directives-libbtn--primary",
			title: "Directives/LibBtn",
			name: "Primary",
			importPath: "./src/stories/lib-btn.stories.ts",
			type: "story" as const,
			subtype: "story" as const,
			tags: [DEV, TEST, MANIFEST],
		},
		"directives-libbtn--secondary": {
			id: "directives-libbtn--secondary",
			title: "Directives/LibBtn",
			name: "Secondary",
			importPath: "./src/stories/lib-btn.stories.ts",
			type: "story" as const,
			subtype: "story" as const,
			tags: [DEV, TEST, MANIFEST],
		},
	},
} as const;

/** All story index entries tagged for manifest generation. */
export const manifestEntries = Object.values(storyIndex.entries).filter((e) =>
	e.tags.includes(MANIFEST),
);
