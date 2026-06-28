import { existsSync } from "node:fs";
import path from "pathe";
import { storyNameFromExport } from "storybook/internal/csf";
import { extractDescription, loadCsf } from "storybook/internal/csf-tools";
import * as ts from "typescript";

import type { Component, Directive } from "./compodocTypes";
import { extractJSDocInfo } from "./jsdocTags";
import { cachedReadTextFileSync } from "./utils";
export type ParsedCsf = ReturnType<ReturnType<typeof loadCsf>["parse"]>;

/** Minimal reference to an Angular component resolved from a story file. */
export interface AngularComponentRef {
	/** Class name, e.g. "ButtonComponent". */
	componentName: string;
	/** Absolute path to the component source file, when resolvable. */
	path: string | undefined;
	/** Raw import specifier from the story file, e.g. "./button.component". */
	importSpecifier: string | undefined;
}

export interface ResolvedAngularStory {
	storyPath: string;
	storyFile: string;
	csf: ParsedCsf;
	/** `meta.component`'s local identifier if declared. */
	componentName: string | undefined;
	/** Resolved primary component reference, or undefined when unresolvable. */
	component: AngularComponentRef | undefined;
}

/** Snippet + metadata for one story. */
export interface ResolvedAngularStoryEntry {
	id: string;
	name: string;
	/** Primary snippet (first selector variant). */
	snippet?: string;
	/**
	 * One snippet per selector variant when the Angular selector contains multiple
	 * comma-separated parts (e.g. `"button[lib-btn], a[lib-btn]"`).
	 * Always populated when `snippet` is defined.
	 */
	snippets?: string[];
	description?: string;
	summary?: string;
	error?: { name: string; message: string };
}

/**
 * Parse a single Angular CSF story file and resolve the primary component reference.
 *
 * Reads the file, extracts `meta.component`, finds the matching import declaration, and resolves
 * the import specifier to an absolute path.
 */
export async function resolveAngularStoryComponent(options: {
	storyPath: string;
	title: string;
}): Promise<ResolvedAngularStory> {
	const { storyPath, title } = options;

	const storyFile = cachedReadTextFileSync(storyPath);
	const csf = loadCsf(storyFile, { makeTitle: () => title }).parse();
	const componentName = csf._meta?.component;

	let component: AngularComponentRef | undefined;

	if (componentName) {
		const importSpecifier = findImportSpecifier(
			storyFile,
			storyPath,
			componentName,
		);
		const resolvedPath = importSpecifier
			? resolveLocalPath(importSpecifier, storyPath)
			: undefined;

		component = { componentName, path: resolvedPath, importSpecifier };
	}

	return { storyPath, storyFile, csf, componentName, component };
}

/**
 * Extract story-level snippets and JSDoc metadata from a parsed CSF file.
 *
 * For Angular, the "snippet" is a generated template string built from the component's selector
 * (from Compodoc) and the story's `args`. Pass `filterStoryIds` to limit output to a subset.
 */
export function extractAngularStorySnippets(
	csf: ParsedCsf,
	compodocData: Component | Directive | null | undefined,
	componentName: string | undefined,
	filterStoryIds?: ReadonlySet<string>,
): ResolvedAngularStoryEntry[] {
	const selector = (compodocData as any)?.selector as string | undefined;
	const inputs = compodocData?.inputsClass ?? [];

	return Object.entries(csf._stories)
		.filter(([, story]) => !filterStoryIds || filterStoryIds.has(story.id))
		.map(([storyExport, story]): ResolvedAngularStoryEntry => {
			const name = story.name ?? storyNameFromExport(storyExport);
			try {
				const jsdocComment = extractDescription(
					csf._storyStatements[storyExport],
				);
				const { tags = {}, description } = jsdocComment
					? extractJSDocInfo(jsdocComment)
					: {};
				const finalDescription =
					(tags?.describe?.[0] || tags?.desc?.[0]) ?? description;

				const args = (story as any).args as Record<string, unknown> | undefined;
				const snippets = buildAngularSnippets(selector, inputs, args);
				const snippet = snippets?.[0];

				return {
					id: story.id,
					name,
					snippet,
					snippets: snippets?.length ? snippets : undefined,
					description: finalDescription?.trim(),
					summary: tags.summary?.[0],
				};
			} catch (e) {
				const err = e instanceof Error ? e : new Error(String(e));
				return {
					id: story.id,
					name,
					error: { name: err.name, message: err.message },
				};
			}
		});
}

// ---------------------------------------------------------------------------
// Angular selector parsing
// ---------------------------------------------------------------------------

/**
 * Parsed representation of one part of an Angular CSS selector.
 *
 * Examples:
 *   `app-button`        → { element: 'app-button', attributes: [] }
 *   `[lib-btn]`         → { element: undefined,    attributes: ['lib-btn'] }
 *   `button[lib-btn]`   → { element: 'button',     attributes: ['lib-btn'] }
 */
interface ParsedSelectorPart {
	element: string | undefined;
	attributes: string[];
}

/**
 * Parse a single Angular selector part (no comma) into its element + attribute parts.
 * Ignores pseudo-classes, class selectors, and everything we don't need for snippets.
 */
function parseSelectorPart(part: string): ParsedSelectorPart {
	const trimmed = part.trim();

	// Extract all attribute selectors [attr] or [attr=val]
	const attrMatches = [...trimmed.matchAll(/\[([^\]=]+)(?:=[^\]]+)?\]/g)];
	const attributes = attrMatches.map((m) => m[1].trim());

	// The element tag is everything before the first [ or . or :
	const elementMatch = trimmed.match(/^([a-z][\w-]*)/i);
	const element = elementMatch?.[1];

	return { element, attributes };
}

/**
 * Build the attribute bindings string for Angular inputs.
 *
 * - Signal `input.required()` inputs get a placeholder when missing from `args`.
 * - Uses the public name (alias) from Compodoc, not `actualName`.
 */
function buildBindings(
	inputs: import("./compodocTypes").Property[],
	args: Record<string, unknown> | undefined,
): string[] {
	const inputByName = new Map(inputs.map((i) => [i.name, i]));
	const bindings: string[] = [];

	for (const input of inputs) {
		if (input.required && !(args && input.name in args)) {
			bindings.push(`[${input.name}]="/* required */"`);
		}
	}

	if (args) {
		for (const [key, value] of Object.entries(args)) {
			if (!inputByName.has(key)) continue;
			if (typeof value === "string") {
				bindings.push(`${key}="${value}"`);
			} else {
				bindings.push(`[${key}]="${JSON.stringify(value)}"`);
			}
		}
	}

	return bindings;
}

/**
 * Render one snippet from a parsed selector part + bindings.
 *
 * - Element selector (`app-button`): `<app-button [i]="v"></app-button>`
 * - Attribute-only (`[lib-btn]`):    `<div lib-btn [i]="v"></div>`  (fallback host: div)
 * - Compound (`button[lib-btn]`):    `<button lib-btn [i]="v"></button>`
 */
function renderSnippet(
	{ element, attributes }: ParsedSelectorPart,
	bindings: string[],
): string {
	const host = element ?? "div";
	const isVoid = ["input", "br", "hr", "img", "area", "link", "meta"].includes(host);

	const parts = [
		host,
		...attributes,
		...bindings,
	].join(" ");

	return isVoid ? `<${parts}>` : `<${parts}></${host}>`;
}

/**
 * Generate one Angular template snippet per selector variant.
 *
 * A selector like `"button[lib-btn], a[lib-btn]"` produces two snippets so
 * consumers can show all valid host-element usages.
 *
 * Returns `undefined` when the selector is missing (no guess is attempted).
 */
function buildAngularSnippets(
	selector: string | undefined,
	inputs: import("./compodocTypes").Property[],
	args: Record<string, unknown> | undefined,
): string[] | undefined {
	if (!selector) {
		return undefined;
	}

	const bindings = buildBindings(inputs, args);

	return selector
		.split(",")
		.map((part) => renderSnippet(parseSelectorPart(part), bindings));
}

// ---------------------------------------------------------------------------
// Import resolution helpers
// ---------------------------------------------------------------------------

const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"] as const;

/**
 * Scan the TypeScript source of a story file and find the module specifier for an import that
 * brings `localName` into scope (named or default import).
 */
function findImportSpecifier(
	source: string,
	filePath: string,
	localName: string,
): string | undefined {
	const sourceFile = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.Latest,
		true,
	);

	let found: string | undefined;

	ts.forEachChild(sourceFile, (node) => {
		if (found) {
			return;
		}
		if (!ts.isImportDeclaration(node)) {
			return;
		}

		const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
		const clause = node.importClause;
		if (!clause) {
			return;
		}

		// import { ButtonComponent } from '...' or import { Foo as ButtonComponent } from '...'
		if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
			for (const el of clause.namedBindings.elements) {
				const boundName = el.name.text;
				const originalName = el.propertyName ? el.propertyName.text : boundName;
				if (boundName === localName || originalName === localName) {
					found = specifier;
					return;
				}
			}
		}

		// import ButtonComponent from '...'
		if (clause.name?.text === localName) {
			found = specifier;
		}
	});

	return found;
}

/** Resolve a relative import specifier to an absolute filesystem path, or return undefined. */
function resolveLocalPath(
	importSpecifier: string,
	fromFile: string,
): string | undefined {
	if (!importSpecifier.startsWith(".")) {
		return undefined;
	}

	const base = path.resolve(path.dirname(fromFile), importSpecifier);

	if (existsSync(base)) {
		return base;
	}

	for (const ext of TS_EXTENSIONS) {
		const candidate = base + ext;
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}
