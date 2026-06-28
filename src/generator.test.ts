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

import { mockFindPackageJson } from "./memfs-test-setup";

import { invalidateCompodocCache } from "./compodocExtractor";
import { manifest } from "./generator";
import { invalidateCache } from "./utils";
import { files, manifestEntries } from "./fixtures";

// ---------------------------------------------------------------------------
// Absolute paths used inside the virtual filesystem
// ---------------------------------------------------------------------------

const ROOT = "/project";
const PACKAGE_JSON_PATH = `${ROOT}/package.json`;
const BUTTON_STORY_PATH = `${ROOT}/src/stories/button.stories.ts`;
const BUTTON_COMPONENT_PATH = `${ROOT}/src/lib/button/button.component.ts`;
const COMPODOC_JSON_PATH = `${ROOT}/documentation.json`;

// ---------------------------------------------------------------------------
// Helper — build an absolute-path volume from the fixture relative-path files
// ---------------------------------------------------------------------------

function absoluteFiles(overrides: Record<string, string> = {}): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [rel, content] of Object.entries(files)) {
		const abs = rel.startsWith("./") ? `${ROOT}/${rel.slice(2)}` : `${ROOT}/${rel}`;
		result[abs] = content;
	}
	return { ...result, ...overrides };
}

// ---------------------------------------------------------------------------
// Helper — run the generator with a virtual filesystem
// ---------------------------------------------------------------------------

async function runManifest(options: {
	extraFiles?: Record<string, string>;
	entries?: typeof manifestEntries;
} = {}) {
	const { extraFiles = {}, entries = manifestEntries } = options;

	vol.fromJSON(absoluteFiles(extraFiles));

	return manifest(
		{},
		{
			manifestEntries: entries,
			watch: false,
			configDir: ROOT,
			outputDir: `${ROOT}/storybook-static`,
			cacheDir: `${ROOT}/.cache`,
			packageJson: {},
			presets: {} as any,
		} as any,
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	vol.reset();
	invalidateCache();
	invalidateCompodocCache();
	vi.spyOn(process, "cwd").mockReturnValue(ROOT);
	mockFindPackageJson.mockReturnValue(PACKAGE_JSON_PATH);
});

describe("manifest generator — happy path", () => {
	it("builds a manifest with the correct component id and name", async () => {
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		expect(component).toBeDefined();
		expect(component?.name).toBe("ButtonComponent");
	});

	it("attaches compodoc selector to the manifest", async () => {
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		expect(component?.selector).toBe("app-button");
	});

	it("marks standalone components", async () => {
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		expect(component?.standalone).toBe(true);
	});

	it("attaches compodoc description", async () => {
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		expect(component?.description).toBe("Primary UI component for user interaction.");
	});

	it("resolves import specifier from the nearest package.json name", async () => {
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		expect(component?.import).toBe('import { ButtonComponent } from "@my-org/my-lib";');
	});

	it("uses the scoped package name in the import statement", async () => {
		const result = await runManifest({
			extraFiles: {
				[PACKAGE_JSON_PATH]: JSON.stringify({ name: "@acme/ui-components" }),
			},
		});
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		expect(component?.import).toBe('import { ButtonComponent } from "@acme/ui-components";');
	});

	it("falls back to relative specifier when no package.json is found", async () => {
		mockFindPackageJson.mockReturnValue(undefined);
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		expect(component?.import).toContain("ButtonComponent");
		expect(component?.import).toContain("../lib/button/button.component");
	});

	it("falls back to relative specifier when package.json has no name field", async () => {
		const result = await runManifest({
			extraFiles: {
				[PACKAGE_JSON_PATH]: JSON.stringify({ version: "1.0.0" }),
			},
		});
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		expect(component?.import).toContain("ButtonComponent");
		expect(component?.import).toContain("../lib/button/button.component");
	});
});

describe("manifest generator — stories", () => {
	it("generates snippets for each story", async () => {
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		expect(component?.stories.length).toBeGreaterThan(0);
	});

	it("generates a snippet using the component selector", async () => {
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		const primary = component?.stories.find((s) => s.name === "Primary");
		expect(primary?.snippet).toBe("<app-button></app-button>");
	});

	it("generates a snippet for every story entry", async () => {
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		const storyNames = component?.stories.map((s) => s.name);
		expect(storyNames).toContain("Primary");
		expect(storyNames).toContain("Disabled");
		expect(storyNames).toContain("Custom Template");
	});

	it("uses render.template when @useTemplate is present", async () => {
		const result = await runManifest();
		const component = Object.values(result.components.components).find(
			(c) => c.name === "ButtonComponent",
		);
		const custom = component?.stories.find((s) => s.name === "Custom Template");
		expect(custom?.snippet).toBe('<app-button label="custom template"></app-button>');
	});
});

describe("manifest generator — LibBtnDirective (compound selector)", () => {
	it("includes the directive in the manifest", async () => {
		const result = await runManifest();
		const directive = Object.values(result.components.components).find(
			(c) => c.name === "LibBtnDirective",
		);
		expect(directive).toBeDefined();
	});

	it("attaches the compound selector", async () => {
		const result = await runManifest();
		const directive = Object.values(result.components.components).find(
			(c) => c.name === "LibBtnDirective",
		);
		expect(directive?.selector).toBe("button[lib-btn], a[lib-btn]");
	});

	it("produces multiple snippets for compound selectors", async () => {
		const result = await runManifest();
		const directive = Object.values(result.components.components).find(
			(c) => c.name === "LibBtnDirective",
		);
		const primary = directive?.stories.find((s) => s.name === "Primary");
		expect(primary?.snippets).toHaveLength(2);
		expect(primary?.snippets?.[0]).toBe("<button lib-btn></button>");
		expect(primary?.snippets?.[1]).toBe("<a lib-btn></a>");
	});

	it("attaches the directive import from the package name", async () => {
		const result = await runManifest();
		const directive = Object.values(result.components.components).find(
			(c) => c.name === "LibBtnDirective",
		);
		expect(directive?.import).toBe('import { LibBtnDirective } from "@my-org/my-lib";');
	});
});

describe("manifest generator — compodoc missing", () => {
	it("returns an error when component not found in compodoc", async () => {
		const emptyCompodoc = JSON.stringify({
			components: [],
			directives: [],
			pipes: [],
			injectables: [],
			classes: [],
		});
		const result = await runManifest({
			extraFiles: { [COMPODOC_JSON_PATH]: emptyCompodoc },
		});
		const component = Object.values(result.components.components).find(
			(c) => "error" in c,
		);
		expect(component?.error).toBeDefined();
		expect(component?.error?.name).toBe("Component not found in Compodoc output");
	});

	it("returns an error when no compodoc file exists", async () => {
		vol.fromJSON({
			[BUTTON_STORY_PATH]: files["./src/stories/button.stories.ts"]!,
			[BUTTON_COMPONENT_PATH]: files["./src/lib/button/button.component.ts"]!,
		});

		const buttonEntry = manifestEntries.find(
			(e) => e.importPath === "./src/stories/button.stories.ts",
		)!;

		const result = await manifest(
			{},
			{
				manifestEntries: [buttonEntry],
				watch: false,
				configDir: ROOT,
				outputDir: `${ROOT}/storybook-static`,
				cacheDir: `${ROOT}/.cache`,
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

		const result = await runManifest({
			extraFiles: { [BUTTON_STORY_PATH]: storiesWithoutComponent },
			entries: manifestEntries.filter(
				(e) => e.importPath === "./src/stories/button.stories.ts",
			),
		});
		const component = Object.values(result.components.components)[0];
		expect(component?.error).toBeDefined();
		expect(component?.error?.name).toBe("No component found");
	});
});
