import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		server: {
			deps: {
				// Ensure node:fs mock via __mocks__ is picked up for built-in modules
				inline: [],
			},
		},
	},
});
