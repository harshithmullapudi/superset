import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES } from "@superset/i18n/locales";
import { isReservedHandle, RESERVED_HANDLES } from "./reserved-handles";
import { handleSchema } from "./schema";

const MARKETING_ROUTES = join(
	import.meta.dir,
	"../../../../../apps/marketing/src/app/[lang]",
);

function routeSegments(): string[] {
	return readdirSync(MARKETING_ROUTES, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => !name.startsWith("(") && !name.startsWith("["))
		.filter((name) => !["components", "hooks", "utils"].includes(name));
}

describe("route collisions", () => {
	test("every marketing route segment is reserved", () => {
		const unreserved = routeSegments().filter(
			(segment) => !RESERVED_HANDLES.has(segment),
		);

		expect(unreserved).toEqual([]);
	});

	test("every supported locale is reserved", () => {
		const unreserved = SUPPORTED_LOCALES.filter(
			(locale) => !isReservedHandle(locale),
		);

		expect(unreserved).toEqual([]);
	});
});

describe("handleSchema", () => {
	test("rejects reserved words", () => {
		for (const handle of [
			"pricing",
			"blog",
			"ja",
			"zh-CN",
			"openai",
			"users",
		]) {
			expect(handleSchema.safeParse(handle).success).toBe(false);
		}
	});

	test("accepts an ordinary handle", () => {
		expect(handleSchema.safeParse("harshith").success).toBe(true);
	});

	test("is case insensitive about reservations", () => {
		expect(handleSchema.safeParse("PRICING").success).toBe(false);
	});

	test("still enforces shape", () => {
		expect(handleSchema.safeParse("-nope").success).toBe(false);
		expect(handleSchema.safeParse("a").success).toBe(false);
		expect(handleSchema.safeParse("has--double").success).toBe(false);
	});
});
