import { readFileSync } from "node:fs";
import { up as findPackageJson } from "empathic/package";
import { getComponentIdFromEntry } from "storybook/internal/common";
import { extractDescription } from "storybook/internal/csf-tools";
import type { ComponentManifest, IndexEntry } from "storybook/internal/types";

import { findComponentByName } from "./compodoc";
import type { CompodocJson, Component, Directive } from "./compodocTypes";
import { extractComponentDescription } from "./extractComponentDescription";
import { extractAngularStorySnippets } from "./resolveAngularComponents";
import type {
	AngularComponentRef,
	ParsedCsf,
	ResolvedAngularStoryEntry,
} from "./resolveAngularComponents.ts";

/**
 * Angular component manifest with Compodoc-specific docgen data attached.
 *
 * Extends the base `ComponentManifest` with Angular-specific metadata from Compodoc 2.0
 * so that consumers (e.g. the HTML debugger, AI tools) can render rich documentation.
 */
export interface AngularComponentManifest extends ComponentManifest {
	/** Full Compodoc component/directive entry. */
	compodoc?: Component | Directive;
	/** `true` for standalone components/directives/pipes (Compodoc 2.0). */
	standalone?: boolean;
	/** Change detection strategy, e.g. `"ChangeDetectionStrategy.OnPush"`. */
	changeDetection?: string;
	/** Raw Angular selector, e.g. `"button[lib-btn], a[lib-btn]"`. */
	selector?: string;
	/** Angular story entries with optional multi-snippet support. */
	stories: ResolvedAngularStoryEntry[];
	[key: string]: unknown;
}

/**
 * Resolve the best import specifier for a component: the nearest package.json `name` field
 * when the component lives inside a published package, or the raw story-relative specifier.
 */
function resolveImportSpecifier(
	component: AngularComponentRef | undefined,
): string | undefined {
	if (!component?.importSpecifier) return undefined;

	if (component.path) {
		const pkgJsonPath = findPackageJson({ cwd: component.path });
		if (pkgJsonPath) {
			try {
				const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
					name?: string;
				};
				if (pkg.name) return pkg.name;
			} catch {
				// fall through to raw specifier
			}
		}
	}

	return component.importSpecifier;
}

/** Build an import statement string for the component. */
function buildImportStatement(
	componentName: string | undefined,
	component: AngularComponentRef | undefined,
): string {
	if (!componentName) return "";
	const specifier = resolveImportSpecifier(component);
	if (!specifier) return "";
	return `import { ${componentName} } from "${specifier}";`;
}

/**
 * Build an {@link AngularComponentManifest} from a resolved story file entry and the Compodoc
 * documentation output. This is the output shape for the Angular `experimental_manifests` preset.
 */
export function buildAngularComponentManifest({
	entry,
	storyFilePath,
	storyFile,
	csf,
	componentName,
	component,
	compodocJson,
	filterStoryIds,
}: {
	entry: IndexEntry;
	storyPath: string;
	storyFilePath: string;
	storyFile: string;
	csf: ParsedCsf;
	componentName: string | undefined;
	component: AngularComponentRef | undefined;
	compodocJson: CompodocJson | null;
	filterStoryIds?: ReadonlySet<string>;
}): AngularComponentManifest {
	const id = getComponentIdFromEntry(entry);
	const title =
		entry.title.split("/").at(-1)?.replace(/\s+/g, "") ?? entry.title;
	const name = componentName ?? title;

	const compodocData =
		componentName && compodocJson
			? findComponentByName(componentName, compodocJson)
			: undefined;

	const stories: ResolvedAngularStoryEntry[] = extractAngularStorySnippets(
		csf,
		compodocData as Component | Directive | undefined,
		componentName,
		filterStoryIds,
	);

	const importStatement = buildImportStatement(componentName, component);

	const base = {
		id,
		name,
		path: storyFilePath,
		stories,
		import: importStatement || undefined,
		jsDocTags: {},
	} satisfies Partial<AngularComponentManifest>;

	if (!compodocData) {
		const error = !csf._meta?.component
			? {
					name: "No component found",
					message:
						"We could not detect the component from your story file. Specify meta.component.",
				}
			: {
					name: "Component not found in Compodoc output",
					message:
						`"${componentName}" was not found in the Compodoc documentation. ` +
						`Make sure your tsconfig includes all source files.\n\n${entry.importPath}:\n${storyFile}`,
				};

		return { ...base, error };
	}

	const compodocDescription =
		compodocData.rawdescription || compodocData.description;
	const metaJsDoc = extractDescription(csf._metaStatement) || undefined;
	const { description, summary, jsDocTags } = extractComponentDescription(
		metaJsDoc,
		compodocDescription,
	);

	const dir = compodocData as Directive | undefined;

	return {
		...base,
		description,
		summary,
		jsDocTags,
		compodoc: compodocData as Component | Directive,
		standalone: dir?.standalone,
		changeDetection: dir?.changeDetection,
		selector: dir?.selector,
	};
}
