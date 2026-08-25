import { describe, expect, test } from "bun:test";

import { nextSharedVersion, servedVersion } from "./sharedVersion";

describe("nextSharedVersion", () => {
	test("pins an older version", () => {
		expect(nextSharedVersion(3, 5)).toBe(3);
	});

	test("picking the latest clears the pin instead of pinning to it", () => {
		expect(nextSharedVersion(5, 5)).toBeNull();
	});

	test("clears the pin when there is only one version", () => {
		expect(nextSharedVersion(1, 1)).toBeNull();
	});

	test("pins when the latest is unknown", () => {
		expect(nextSharedVersion(2, null)).toBe(2);
	});
});

describe("servedVersion", () => {
	test("an unpinned page follows the latest", () => {
		expect(servedVersion(null, 5)).toBe(5);
	});

	test("a pinned page stays on its version", () => {
		expect(servedVersion(3, 5)).toBe(3);
	});

	test("is null when there are no versions at all", () => {
		expect(servedVersion(null, null)).toBeNull();
	});
});
