/**
 * Helpers for tests that use memfs to mock the filesystem.
 *
 * Each test file must declare its own vi.mock() calls at the top level so
 * Vitest can hoist them. This module only exports the typed mock reference —
 * it must be imported AFTER the vi.mock() declarations in the test file.
 *
 * Pattern mirrors code/renderers/react/src/componentManifest/memfs-test-setup.ts
 * in the Storybook monorepo.
 *
 * Required vi.mock() calls in each consuming test file:
 *
 *   vi.mock("node:fs", async () => {
 *     const { fs } = await import("memfs");
 *     return { ...fs, default: fs };
 *   });
 *   vi.mock("empathic/package", () => ({ up: vi.fn() }));
 */

import { up as findPackageJson } from "empathic/package";
import { vi } from "vitest";

export const mockFindPackageJson = vi.mocked(findPackageJson);
