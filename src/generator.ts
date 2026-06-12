import path from "node:path";
import type {
	IndexEntry,
	Manifests,
	PresetPropertyFn,
	StorybookConfigRaw,
} from "storybook/internal/types";
import { buildAngularComponentManifest } from "./buildAngularComponentManifest";
import {
	getCompodocDocumentation,
	invalidateCompodocCache,
} from "./compodocExtractor";
import { resolveAngularStoryComponent } from "./resolveAngularComponents";
import { invalidateCache } from "./utils";

export const manifest: PresetPropertyFn<
	"experimental_manifests",
	StorybookConfigRaw,
	{ manifestEntries: IndexEntry[]; watch: boolean }
> = async (existingManifests = {}, options) => {
	const { manifestEntries } = options;

	invalidateCache();
	invalidateCompodocCache();

	const startTime = performance.now();

	const cwd = process.cwd();
	const compodocJson = getCompodocDocumentation({ cwd });

	const entriesByUniqueComponent = [
		...manifestEntries
			.reduce((map, entry) => {
				if (!map.has(entry.importPath)) {
					map.set(entry.importPath, entry);
				}
				return map;
			}, new Map<string, IndexEntry>())
			.values(),
	];

	const manifestEntryIds = new Set(manifestEntries.map((entry) => entry.id));

	const components = (
		await Promise.all(
			entriesByUniqueComponent.map(async (entry) => {
				const storyFilePath = entry.importPath;
				if (!storyFilePath) {
					return undefined;
				}

				const storyPath = path.join(cwd, storyFilePath);

				const resolved = await resolveAngularStoryComponent({
					storyPath,
					title: entry.title,
				});

				return buildAngularComponentManifest({
					entry,
					storyFilePath,
					compodocJson,
					filterStoryIds: manifestEntryIds,
					...resolved,
				});
			}),
		)
	).filter((c): c is NonNullable<typeof c> => c !== undefined);

	const durationMs = Math.round(performance.now() - startTime);

	console.info(
		`[angular:manifest] Built Angular component manifest for ${components.length} components in ${durationMs}ms.`,
	);

	return {
		...existingManifests,
		components: {
			v: 0,
			components: Object.fromEntries(components.map((c) => [c.id, c])),
			meta: {
				docgen: "compodoc",
				durationMs,
			},
		},
	} as unknown as Manifests;
};
