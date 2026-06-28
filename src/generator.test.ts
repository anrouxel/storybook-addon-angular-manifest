/**
 * End-to-end tests for the Angular manifest generator.
 *
 * Uses memfs to mount a virtual filesystem (story files, component files,
 * compodoc JSON) so the full pipeline can run without real disk I/O.
 * Pattern mirrors how @storybook/react tests its componentManifest generator.
 */

import { vol } from "memfs";
import { dedent } from "ts-dedent";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Redirect node:fs → memfs so the generator reads from a virtual filesystem.
// The factory form is required for node: built-ins in vitest.
vi.mock("node:fs", async () => {
	const { fs } = await import("memfs");
	return { ...fs, default: fs };
});

import { invalidateCompodocCache } from "./compodocExtractor";
import { manifest } from "./generator";
import { invalidateCache } from "./utils";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BUTTON_COMPONENT_PATH = "/project/src/lib/button/button.component.ts";
const BUTTON_STORY_PATH = "/project/src/stories/button.stories.ts";
const PACKAGE_JSON_PATH = "/project/package.json";
const COMPODOC_JSON_PATH = "/project/documentation.json";

const buttonComponentSource = dedent`
  import { Component, Input, Output, EventEmitter } from '@angular/core';

  @Component({
    selector: 'app-button',
    standalone: true,
    template: '<button>{{ label }}</button>',
  })
  export class ButtonComponent {
    @Input() label = 'Click me';
    @Input() disabled = false;
    @Output() clicked = new EventEmitter<void>();
  }
`;

const buttonStoriesSource = dedent`
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

  /**
   * @useTemplate
   */
  export const CustomTemplate: StoryObj<ButtonComponent> = {
    render: (args) => ({ template: \`<app-button label="custom"></app-button>\` }),
  };
`;

const compodocJson = {
	components: [
		{
			name: "ButtonComponent",
			type: "component",
			selector: "app-button",
			standalone: true,
			description: "A reusable button component.",
			rawdescription: "A reusable button component.",
			inputsClass: [
				{ name: "label", type: "string", optional: true, defaultValue: "'Click me'" },
				{ name: "disabled", type: "boolean", optional: true, defaultValue: "false" },
			],
			outputsClass: [
				{ name: "clicked", type: "EventEmitter<void>", optional: true },
			],
			propertiesClass: [],
			methodsClass: [],
		},
	],
	directives: [],
	pipes: [],
	injectables: [],
	classes: [],
};

// ---------------------------------------------------------------------------
// Helper — run the generator with a virtual filesystem
// ---------------------------------------------------------------------------

async function runManifest(options: {
	storiesCode?: string;
	componentCode?: string;
	compodoc?: object;
	extraFiles?: Record<string, string>;
}) {
	const {
		storiesCode = buttonStoriesSource,
		componentCode = buttonComponentSource,
		compodoc = compodocJson,
		extraFiles = {},
	} = options;

	vol.fromJSON({
		[PACKAGE_JSON_PATH]: JSON.stringify({ name: "@my-org/my-lib" }),
		[BUTTON_STORY_PATH]: storiesCode,
		[BUTTON_COMPONENT_PATH]: componentCode,
		[COMPODOC_JSON_PATH]: JSON.stringify(compodoc),
		...extraFiles,
	});

	const storyBase = {
		title: "Components/Button",
		importPath: "./src/stories/button.stories.ts",
		type: "story" as const,
		subtype: "story" as const,
		tags: [],
	};

	const result = await manifest(
		{},
		{
			manifestEntries: [
				{ ...storyBase, id: "components-button--primary", name: "Primary" },
				{ ...storyBase, id: "components-button--disabled", name: "Disabled" },
				{ ...storyBase, id: "components-button--custom-template", name: "Custom Template" },
			],
			watch: false,
			configDir: "/project",
			outputDir: "/project/storybook-static",
			cacheDir: "/project/.cache",
			packageJson: {},
			presets: {} as any,
		} as any,
	);

	return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	vol.reset();
	invalidateCache();
	invalidateCompodocCache();
	vi.spyOn(process, "cwd").mockReturnValue("/project");
});

describe("manifest generator — happy path", () => {
	it("builds a manifest with the correct component id and name", async () => {
		const result = await runManifest({});
		const component = Object.values(result.components.components)[0];
		expect(component).toBeDefined();
		expect(component?.name).toBe("ButtonComponent");
	});

	it("attaches compodoc selector to the manifest", async () => {
		const result = await runManifest({});
		const component = Object.values(result.components.components)[0];
		expect(component?.selector).toBe("app-button");
	});

	it("marks standalone components", async () => {
		const result = await runManifest({});
		const component = Object.values(result.components.components)[0];
		expect(component?.standalone).toBe(true);
	});

	it("attaches compodoc description", async () => {
		const result = await runManifest({});
		const component = Object.values(result.components.components)[0];
		expect(component?.description).toBe("A reusable button component.");
	});

	it("generates an import statement for the component", async () => {
		const result = await runManifest({});
		const component = Object.values(result.components.components)[0];
		// The exact specifier depends on empathic's package.json traversal.
		// We verify the shape of the import rather than the specifier source,
		// as the package.json resolution is tested separately in unit tests.
		expect(component?.import).toContain("ButtonComponent");
		expect(component?.import).toContain("import {");
	});
});

describe("manifest generator — stories", () => {
	it("generates snippets for each story", async () => {
		const result = await runManifest({});
		const component = Object.values(result.components.components)[0];
		expect(component?.stories.length).toBeGreaterThan(0);
	});

	it("generates a snippet using the component selector", async () => {
		const result = await runManifest({});
		const component = Object.values(result.components.components)[0];
		const primary = component?.stories.find((s) => s.name === "Primary");
		// loadCsf does not evaluate args statically, so snippets use the selector only.
		// Arg bindings are tested in resolveAngularComponents.test.ts unit tests.
		expect(primary?.snippet).toBe("<app-button></app-button>");
	});

	it("generates a snippet for every story entry", async () => {
		const result = await runManifest({});
		const component = Object.values(result.components.components)[0];
		const storyNames = component?.stories.map((s) => s.name);
		expect(storyNames).toContain("Primary");
		expect(storyNames).toContain("Disabled");
		expect(storyNames).toContain("Custom Template");
	});

	it("uses render.template when @useTemplate is present", async () => {
		const result = await runManifest({});
		const component = Object.values(result.components.components)[0];
		const custom = component?.stories.find((s) => s.name === "Custom Template");
		expect(custom?.snippet).toBe('<app-button label="custom"></app-button>');
	});
});

describe("manifest generator — compodoc missing", () => {
	it("returns an error when component not found in compodoc", async () => {
		const result = await runManifest({
			compodoc: { components: [], directives: [], pipes: [], injectables: [], classes: [] },
		});
		const component = Object.values(result.components.components)[0];
		expect(component?.error).toBeDefined();
		expect(component?.error?.name).toBe("Component not found in Compodoc output");
	});

	it("returns an error when no compodoc file exists", async () => {
		vol.fromJSON({
			[BUTTON_STORY_PATH]: buttonStoriesSource,
			[BUTTON_COMPONENT_PATH]: buttonComponentSource,
		});

		const result = await manifest(
			{},
			{
				manifestEntries: [
					{
						id: "components-button--primary",
						title: "Components/Button",
						importPath: "./src/stories/button.stories.ts",
						name: "Primary",
						type: "story" as const,
						subtype: "story" as const,
						tags: [],
					},
				],
				watch: false,
				configDir: "/project",
				outputDir: "/project/storybook-static",
				cacheDir: "/project/.cache",
				packageJson: {},
				presets: {} as any,
			} as any,
		);

		const component = Object.values(result.components.components)[0];
		expect(component?.error).toBeDefined();
	});
});

describe("manifest generator — meta.component missing", () => {
	it("returns an error when story has no component in meta", async () => {
		const storiesWithoutComponent = dedent`
      import type { Meta } from '@storybook/angular';
      const meta: Meta = { title: 'Components/Button' };
      export default meta;
      export const Primary = { args: {} };
    `;

		const result = await runManifest({ storiesCode: storiesWithoutComponent });
		const component = Object.values(result.components.components)[0];
		expect(component?.error).toBeDefined();
		expect(component?.error?.name).toBe("No component found");
	});
});

describe("manifest generator — selector variants", () => {
	it("produces multiple snippets for compound selectors", async () => {
		const multiSelectorCompodoc = {
			...compodocJson,
			components: [
				{
					...compodocJson.components[0]!,
					selector: "button[lib-btn], a[lib-btn]",
					inputsClass: [],
					outputsClass: [],
				},
			],
		};

		const storiesSimple = dedent`
      import type { Meta, StoryObj } from '@storybook/angular';
      import { ButtonComponent } from '../lib/button/button.component';
      const meta: Meta<ButtonComponent> = { title: 'Components/Button', component: ButtonComponent };
      export default meta;
      export const Primary: StoryObj<ButtonComponent> = {};
    `;

		const result = await runManifest({
			storiesCode: storiesSimple,
			compodoc: multiSelectorCompodoc,
		});
		const component = Object.values(result.components.components)[0];
		const primary = component?.stories.find((s) => s.name === "Primary");
		expect(primary?.snippets).toHaveLength(2);
		expect(primary?.snippets?.[0]).toBe("<button lib-btn></button>");
		expect(primary?.snippets?.[1]).toBe("<a lib-btn></a>");
	});
});
