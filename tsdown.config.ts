import { defineConfig } from "tsdown";

export default defineConfig({
	format: ["esm"],
	target: "node22",
	dts: true,
	clean: true,
	sourcemap: true,
	entry: ["src/index.ts", "src/preset.ts"],
});
