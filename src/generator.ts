import type {
	IndexEntry,
	PresetPropertyFn,
	StorybookConfigRaw,
} from "storybook/internal/types";

export const manifest: PresetPropertyFn<
	"experimental_manifests",
	StorybookConfigRaw,
	{ manifestEntries: IndexEntry[]; watch: boolean }
> = async (existingManifests = {}, options) => {};
