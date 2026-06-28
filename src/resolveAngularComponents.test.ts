import { loadCsf } from "storybook/internal/csf-tools";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import type { ParsedCsf } from "./resolveAngularComponents";
import {
	extractAngularStorySnippets,
	extractStoryRenderTemplate,
} from "./resolveAngularComponents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSourceFile(code: string): ts.SourceFile {
	return ts.createSourceFile("story.ts", code, ts.ScriptTarget.Latest, true);
}

function makeParsedCsf(overrides: Partial<ParsedCsf> = {}): ParsedCsf {
	return {
		_code: "",
		_meta: {},
		_stories: {},
		_storyStatements: {},
		_metaStatement: undefined,
		...overrides,
	} as unknown as ParsedCsf;
}

// ---------------------------------------------------------------------------
// extractStoryRenderTemplate
// ---------------------------------------------------------------------------

describe("extractStoryRenderTemplate", () => {
	it("extracts template from arrow function with parenthesised object", () => {
		const source = makeSourceFile(`
      export const Primary = {
        render: (args) => ({ template: \`<app-button></app-button>\` }),
      };
    `);
		expect(extractStoryRenderTemplate(source, "Primary")).toBe(
			"<app-button></app-button>",
		);
	});

	it("extracts template from arrow function with block body and return", () => {
		const source = makeSourceFile(`
      export const Primary = {
        render: (args) => {
          return { template: \`<app-button [label]="label"></app-button>\` };
        },
      };
    `);
		expect(extractStoryRenderTemplate(source, "Primary")).toBe(
			'<app-button [label]="label"></app-button>',
		);
	});

	it("extracts string literal template", () => {
		const source = makeSourceFile(`
      export const WithString = {
        render: (args) => ({ template: '<app-button></app-button>' }),
      };
    `);
		expect(extractStoryRenderTemplate(source, "WithString")).toBe(
			"<app-button></app-button>",
		);
	});

	it("returns undefined when story has no render function", () => {
		const source = makeSourceFile(`
      export const Primary = { args: { label: 'Click' } };
    `);
		expect(extractStoryRenderTemplate(source, "Primary")).toBeUndefined();
	});

	it("returns undefined when render has no template property", () => {
		const source = makeSourceFile(`
      export const Primary = {
        render: (args) => ({ component: ButtonComponent }),
      };
    `);
		expect(extractStoryRenderTemplate(source, "Primary")).toBeUndefined();
	});

	it("returns undefined for unknown story export name", () => {
		const source = makeSourceFile(`
      export const Primary = {
        render: (args) => ({ template: \`<app-button></app-button>\` }),
      };
    `);
		expect(extractStoryRenderTemplate(source, "Secondary")).toBeUndefined();
	});

	it("handles template with interpolations", () => {
		const source = makeSourceFile(`
      export const Dynamic = {
        render: (args) => ({ template: \`<app-button [label]="\${args.label}"></app-button>\` }),
      };
    `);
		const result = extractStoryRenderTemplate(source, "Dynamic");
		expect(result).toContain("<app-button");
		expect(result).toContain("args.label");
	});
});

// ---------------------------------------------------------------------------
// extractAngularStorySnippets — snippet generation
// ---------------------------------------------------------------------------

const compodocButton = {
	name: "ButtonComponent",
	type: "component" as const,
	selector: "app-button",
	inputsClass: [
		{ name: "label", type: "string", optional: true },
		{ name: "disabled", type: "boolean", optional: true },
		{ name: "count", type: "number", optional: true },
	],
	outputsClass: [
		{ name: "clicked", type: "EventEmitter<void>", optional: true },
	],
	propertiesClass: [],
	methodsClass: [],
};

describe("extractAngularStorySnippets — element selector", () => {
	it("generates snippet with element selector and no args", () => {
		const csf = makeParsedCsf({
			_code: "export const Primary = {};",
			_stories: { Primary: { id: "button--primary", name: "Primary" } as any },
			_storyStatements: { Primary: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
		);
		expect(entry?.snippet).toBe("<app-button></app-button>");
	});

	it("renders string args as plain attributes", () => {
		const csf = makeParsedCsf({
			_code: "export const WithLabel = { args: { label: 'Click me' } };",
			_stories: {
				WithLabel: {
					id: "button--with-label",
					name: "With Label",
					args: { label: "Click me" },
				} as any,
			},
			_storyStatements: { WithLabel: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
		);
		expect(entry?.snippet).toContain('label="Click me"');
	});

	it("renders boolean true as bare attribute", () => {
		const csf = makeParsedCsf({
			_code: "export const Disabled = { args: { disabled: true } };",
			_stories: {
				Disabled: {
					id: "button--disabled",
					name: "Disabled",
					args: { disabled: true },
				} as any,
			},
			_storyStatements: { Disabled: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
		);
		expect(entry?.snippet).toContain(" disabled");
		expect(entry?.snippet).not.toContain("[disabled]");
	});

	it("renders boolean false as property binding", () => {
		const csf = makeParsedCsf({
			_code: "export const Enabled = { args: { disabled: false } };",
			_stories: {
				Enabled: {
					id: "button--enabled",
					name: "Enabled",
					args: { disabled: false },
				} as any,
			},
			_storyStatements: { Enabled: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
		);
		expect(entry?.snippet).toContain('[disabled]="false"');
	});

	it("renders number args as property bindings", () => {
		const csf = makeParsedCsf({
			_code: "export const WithCount = { args: { count: 42 } };",
			_stories: {
				WithCount: {
					id: "button--with-count",
					name: "With Count",
					args: { count: 42 },
				} as any,
			},
			_storyStatements: { WithCount: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
		);
		expect(entry?.snippet).toContain('[count]="42"');
	});

	it("renders outputs as event bindings", () => {
		const csf = makeParsedCsf({
			_code: "export const WithClick = { args: { clicked: () => {} } };",
			_stories: {
				WithClick: {
					id: "button--with-click",
					name: "With Click",
					args: { clicked: () => {} },
				} as any,
			},
			_storyStatements: { WithClick: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
		);
		expect(entry?.snippet).toContain('(clicked)="handleEvent($event)"');
	});

	it("ignores args not in inputs or outputs", () => {
		const csf = makeParsedCsf({
			_code: "export const Primary = { args: { unknown: 'value' } };",
			_stories: {
				Primary: {
					id: "button--primary",
					name: "Primary",
					args: { unknown: "value" },
				} as any,
			},
			_storyStatements: { Primary: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
		);
		expect(entry?.snippet).toBe("<app-button></app-button>");
	});
});

describe("extractAngularStorySnippets — required signal inputs", () => {
	const compodocRequired = {
		...compodocButton,
		inputsClass: [
			{ name: "label", type: "string", optional: false, required: true },
			{ name: "count", type: "number", optional: true },
		],
		outputsClass: [],
	};

	it("adds placeholder for required inputs with no provided arg", () => {
		const csf = makeParsedCsf({
			_code: "export const Primary = {};",
			_stories: { Primary: { id: "button--primary", name: "Primary" } as any },
			_storyStatements: { Primary: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocRequired,
			"ButtonComponent",
		);
		expect(entry?.snippet).toContain('[label]="/* required */"');
	});

	it("does not add placeholder when required input has arg value", () => {
		const csf = makeParsedCsf({
			_code: "export const Primary = { args: { label: 'Click' } };",
			_stories: {
				Primary: {
					id: "button--primary",
					name: "Primary",
					args: { label: "Click" },
				} as any,
			},
			_storyStatements: { Primary: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocRequired,
			"ButtonComponent",
		);
		expect(entry?.snippet).not.toContain("/* required */");
		expect(entry?.snippet).toContain('label="Click"');
	});
});

describe("extractAngularStorySnippets — attribute-only selector", () => {
	const compodocAttrDir = {
		name: "LibBtnDirective",
		type: "directive" as const,
		selector: "[lib-btn]",
		inputsClass: [{ name: "color", type: "string", optional: true }],
		outputsClass: [],
		propertiesClass: [],
		methodsClass: [],
	};

	it("uses div as fallback host for attribute-only selector", () => {
		const csf = makeParsedCsf({
			_code: "export const Primary = {};",
			_stories: { Primary: { id: "dir--primary", name: "Primary" } as any },
			_storyStatements: { Primary: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocAttrDir,
			"LibBtnDirective",
		);
		expect(entry?.snippet).toBe("<div lib-btn></div>");
	});
});

describe("extractAngularStorySnippets — compound selector (multiple variants)", () => {
	const compodocMulti = {
		name: "LibBtnDirective",
		type: "directive" as const,
		selector: "button[lib-btn], a[lib-btn]",
		inputsClass: [],
		outputsClass: [],
		propertiesClass: [],
		methodsClass: [],
	};

	it("produces one snippet per selector variant", () => {
		const csf = makeParsedCsf({
			_code: "export const Primary = {};",
			_stories: { Primary: { id: "dir--primary", name: "Primary" } as any },
			_storyStatements: { Primary: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocMulti,
			"LibBtnDirective",
		);
		expect(entry?.snippets).toHaveLength(2);
		expect(entry?.snippets?.[0]).toBe("<button lib-btn></button>");
		expect(entry?.snippets?.[1]).toBe("<a lib-btn></a>");
		expect(entry?.snippet).toBe("<button lib-btn></button>");
	});
});

describe("extractAngularStorySnippets — void elements", () => {
	const compodocInput = {
		name: "InputDirective",
		type: "directive" as const,
		selector: "input[lib-input]",
		inputsClass: [{ name: "placeholder", type: "string", optional: true }],
		outputsClass: [],
		propertiesClass: [],
		methodsClass: [],
	};

	it("renders void elements as self-closing", () => {
		const csf = makeParsedCsf({
			_code: "export const Primary = { args: { placeholder: 'Type here' } };",
			_stories: {
				Primary: {
					id: "input--primary",
					name: "Primary",
					args: { placeholder: "Type here" },
				} as any,
			},
			_storyStatements: { Primary: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocInput,
			"InputDirective",
		);
		expect(entry?.snippet).toBe('<input lib-input placeholder="Type here">');
		expect(entry?.snippet).not.toContain("</input>");
	});
});

describe("extractAngularStorySnippets — no selector", () => {
	it("returns undefined snippet when compodoc has no selector", () => {
		const csf = makeParsedCsf({
			_code: "export const Primary = {};",
			_stories: { Primary: { id: "btn--primary", name: "Primary" } as any },
			_storyStatements: { Primary: undefined as any },
		});

		const compodocNoSelector = { ...compodocButton, selector: undefined };
		const [entry] = extractAngularStorySnippets(
			csf,
			compodocNoSelector,
			"ButtonComponent",
		);
		expect(entry?.snippet).toBeUndefined();
		expect(entry?.snippets).toBeUndefined();
	});
});

describe("extractAngularStorySnippets — @useTemplate", () => {
	it("uses render.template as snippet when @useTemplate is present", () => {
		// loadCsf is needed so _storyStatements has real AST nodes with JSDoc attached
		// (required for extractDescription to detect @useTemplate).
		// _code must also contain the render function so extractStoryRenderTemplate can parse it.
		const code = `
export default { title: 'Button', component: 'ButtonComponent' };

/** @useTemplate */
export const WithTemplate = {
  render: (args) => ({ template: \`<app-button label="custom"></app-button>\` }),
};
`;
		const csf = loadCsf(code, { makeTitle: () => "Button" }).parse();

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
		);
		expect(entry?.snippet).toBe('<app-button label="custom"></app-button>');
	});

	it("uses Compodoc snippet when @useTemplate is absent even with a render function", () => {
		// loadCsf does not evaluate args statically, so we use makeParsedCsf with manual args.
		// This verifies that without @useTemplate the Compodoc path is taken (no render template).
		const csf = makeParsedCsf({
			_code: `
export const WithRender = {
  args: { label: 'Click' },
  render: (args) => ({ template: \`<app-button label="IGNORED"></app-button>\` }),
};`,
			_stories: {
				WithRender: {
					id: "button--with-render",
					name: "With Render",
					args: { label: "Click" },
				} as any,
			},
			_storyStatements: { WithRender: undefined as any },
		});

		const [entry] = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
		);
		// Compodoc snippet uses the args, not the render template
		expect(entry?.snippet).toContain("app-button");
		expect(entry?.snippet).toContain('label="Click"');
		expect(entry?.snippet).not.toContain("IGNORED");
	});
});

describe("extractAngularStorySnippets — filterStoryIds", () => {
	it("only returns entries matching the filter set", () => {
		const csf = makeParsedCsf({
			_code: "export const Primary = {}; export const Secondary = {};",
			_stories: {
				Primary: { id: "btn--primary", name: "Primary" } as any,
				Secondary: { id: "btn--secondary", name: "Secondary" } as any,
			},
			_storyStatements: {
				Primary: undefined as any,
				Secondary: undefined as any,
			},
		});

		const entries = extractAngularStorySnippets(
			csf,
			compodocButton,
			"ButtonComponent",
			new Set(["btn--primary"]),
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.id).toBe("btn--primary");
	});
});
