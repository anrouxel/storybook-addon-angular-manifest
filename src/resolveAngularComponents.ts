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
	snippet?: string;
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
	filterStoryIds?: ReadonlySet<string>,
): ResolvedAngularStoryEntry[] {
	const selector = (compodocData as any)?.selector as string | undefined;
	const inputNames = new Set(
		(compodocData?.inputsClass ?? []).map((i) => i.name),
	);

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
				const snippet = buildAngularSnippet(selector, inputNames, args);

				return {
					id: story.id,
					name,
					snippet,
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

/**
 * Generate a minimal Angular template snippet for a story, suitable for the manifest.
 *
 * Uses the component's selector and binds story `args` that match declared `@Input()` properties.
 */
function buildAngularSnippet(
	selector: string | undefined,
	inputNames: Set<string>,
	args: Record<string, unknown> | undefined,
): string | undefined {
	if (!selector) {
		return undefined;
	}

	const bindings = args
		? Object.entries(args)
				.filter(([key]) => inputNames.has(key))
				.map(([key, value]) => {
					if (typeof value === "string") {
						return `${key}="${value}"`;
					}
					return `[${key}]="${JSON.stringify(value)}"`;
				})
		: [];

	if (bindings.length === 0) {
		return `<${selector}></${selector}>`;
	}

	return `<${selector} ${bindings.join(" ")}></${selector}>`;
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
