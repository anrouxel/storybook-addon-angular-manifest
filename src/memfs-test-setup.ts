/**
 * Vitest setup for tests that use memfs to mock the filesystem.
 *
 * Import this module at the top of any test file that needs a virtual
 * filesystem. The vi.mock() calls must be at module scope (hoisted by
 * Vitest) so they cannot live inside a beforeEach or helper function.
 *
 * Pattern mirrors code/renderers/react/src/componentManifest/memfs-test-setup.ts
 * in the Storybook monorepo.
 *
 * Usage:
 *   import { mockFindPackageJson } from './memfs-test-setup';
 */

import { vi } from "vitest";

// Redirect node:fs → memfs so generators read from a virtual filesystem.
// The factory form is required for node: built-ins in Vitest.
vi.mock("node:fs", async () => {
	const { fs } = await import("memfs");
	return { ...fs, default: fs };
});

// Mock empathic/package to control which package.json is resolved without
// relying on empathic's own node:fs calls (which bypass the memfs mock).
vi.mock("empathic/package", () => ({
	up: vi.fn(),
}));

export { vi };

import { up as findPackageJson } from "empathic/package";
export const mockFindPackageJson = vi.mocked(findPackageJson);
