import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("../../env", () => ({
	env: {
		BETTER_AUTH_SECRET: "test-secret",
		NEXT_PUBLIC_API_URL: "https://api.test",
	},
}));

const { buildAuthorizationUrl, clientCredentials, redirectUri } = await import(
	"./oauth"
);

describe("clientCredentials", () => {
	const vars = ["PLUGIN_LINEAR_CLIENT_ID", "PLUGIN_LINEAR_CLIENT_SECRET"];
	const saved = new Map(vars.map((name) => [name, process.env[name]]));

	afterEach(() => {
		for (const name of vars) {
			const value = saved.get(name);
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	test("reads the per-plugin env pair", () => {
		process.env.PLUGIN_LINEAR_CLIENT_ID = "id";
		process.env.PLUGIN_LINEAR_CLIENT_SECRET = "secret";

		expect(clientCredentials("linear")).toEqual({
			clientId: "id",
			clientSecret: "secret",
		});
	});

	test("returns null when only one half is set", () => {
		process.env.PLUGIN_LINEAR_CLIENT_ID = "id";
		delete process.env.PLUGIN_LINEAR_CLIENT_SECRET;

		expect(clientCredentials("linear")).toBeNull();
	});

	test("maps dots and dashes in a plugin name to underscores", () => {
		process.env.PLUGIN_CHROME_DEVTOOLS_CLIENT_ID = "id";
		process.env.PLUGIN_CHROME_DEVTOOLS_CLIENT_SECRET = "secret";

		expect(clientCredentials("chrome-devtools")).not.toBeNull();

		delete process.env.PLUGIN_CHROME_DEVTOOLS_CLIENT_ID;
		delete process.env.PLUGIN_CHROME_DEVTOOLS_CLIENT_SECRET;
	});
});

describe("buildAuthorizationUrl", () => {
	beforeEach(() => {
		process.env.PLUGIN_LINEAR_CLIENT_ID = "id";
		process.env.PLUGIN_LINEAR_CLIENT_SECRET = "secret";
	});

	afterEach(() => {
		delete process.env.PLUGIN_LINEAR_CLIENT_ID;
		delete process.env.PLUGIN_LINEAR_CLIENT_SECRET;
	});

	const auth = {
		type: "oauth2" as const,
		authorization_url: "https://linear.app/oauth/authorize",
		scopes: ["read", "write"],
		scope_separator: ",",
	};

	test("carries the client id, redirect, and state", () => {
		const url = new URL(
			buildAuthorizationUrl("linear", auth, { inputs: {} }, "state-token"),
		);

		expect(url.searchParams.get("client_id")).toBe("id");
		expect(url.searchParams.get("state")).toBe("state-token");
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("redirect_uri")).toBe(redirectUri("linear"));
	});

	test("joins scopes with the manifest's separator", () => {
		const url = new URL(
			buildAuthorizationUrl("linear", auth, { inputs: {} }, "s"),
		);
		expect(url.searchParams.get("scope")).toBe("read,write");
	});

	test("defaults the separator to a space", () => {
		const url = new URL(
			buildAuthorizationUrl(
				"linear",
				{ ...auth, scope_separator: undefined },
				{ inputs: {} },
				"s",
			),
		);
		expect(url.searchParams.get("scope")).toBe("read write");
	});

	test("refuses to build a URL for an unconfigured plugin", () => {
		delete process.env.PLUGIN_LINEAR_CLIENT_SECRET;
		expect(() =>
			buildAuthorizationUrl("linear", auth, { inputs: {} }, "s"),
		).toThrow(/No OAuth client configured/);
	});

	test("every plugin's callback sits under one registerable prefix", () => {
		expect(redirectUri("linear")).toBe(
			"https://api.test/api/plugins/callback/linear",
		);
	});
});
