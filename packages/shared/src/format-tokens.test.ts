import { describe, expect, it } from "bun:test";
import { formatTokens } from "./format-tokens";

describe("formatTokens", () => {
	it("scales through K/M/B/T", () => {
		expect(formatTokens(1_240_000_000_000)).toBe("1.24T");
		expect(formatTokens(13_930_000_000)).toBe("13.9B");
		expect(formatTokens(4_200_000)).toBe("4.2M");
		expect(formatTokens(850_000)).toBe("850K");
		expect(formatTokens(312)).toBe("312");
	});

	it("groups raw counts under a thousand", () => {
		expect(formatTokens(0)).toBe("0");
		expect(formatTokens(999)).toBe("999");
	});
});
