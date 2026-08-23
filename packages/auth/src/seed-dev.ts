import { db } from "@superset/db/client";
import {
	members,
	oauthClients,
	subscriptions,
	users,
} from "@superset/db/schema";
import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { and, eq } from "drizzle-orm";
import { env } from "./env";
import { auth } from "./server";

// Must match CLIENT_ID and the redirect URIs in packages/cli/src/lib/auth.ts.
const CLI_CLIENT_ID = "superset-cli";
const CLI_LOOPBACK_PORTS = [51789, 51790, 51791, 51792, 51793];

// The paste fallback is registered for every web origin the CLI might send,
// because the CLI reads $SUPERSET_WEB_URL and this package reads
// NEXT_PUBLIC_WEB_URL — a mismatch is exactly the `invalid_redirect_uri` the
// seed exists to prevent.
const CLI_WEB_URLS = [
	...new Set(
		[process.env.SUPERSET_WEB_URL, env.NEXT_PUBLIC_WEB_URL].filter(
			(url): url is string => Boolean(url),
		),
	),
];
const CLI_REDIRECT_URIS = [
	...CLI_LOOPBACK_PORTS.map((port) => `http://127.0.0.1:${port}/callback`),
	...CLI_WEB_URLS.map((url) => new URL("/cli/auth/code", url).toString()),
];

async function seedDevAccount(): Promise<void> {
	if (process.env.NODE_ENV !== "development") {
		throw new Error(
			"seed-dev is local-dev only; run with NODE_ENV=development",
		);
	}

	let user = await db.query.users.findFirst({
		where: eq(users.email, DEV_EMAIL),
	});
	if (user) {
		console.log(`Dev account already exists: ${DEV_EMAIL}`);
	} else {
		await auth.api.signUpEmail({
			body: { email: DEV_EMAIL, password: DEV_PASSWORD, name: DEV_NAME },
		});
		user = await db.query.users.findFirst({
			where: eq(users.email, DEV_EMAIL),
		});
		console.log(`Seeded dev account: ${DEV_EMAIL}`);
	}
	if (!user) throw new Error("dev user was not created");

	await db
		.update(users)
		.set({ onboardedAt: new Date() })
		.where(eq(users.id, user.id));

	const membership = await db.query.members.findFirst({
		where: eq(members.userId, user.id),
	});
	if (!membership) throw new Error("dev user has no organization");

	const activeSubscription = await db.query.subscriptions.findFirst({
		where: and(
			eq(subscriptions.referenceId, membership.organizationId),
			eq(subscriptions.status, "active"),
		),
	});
	if (!activeSubscription) {
		await db.insert(subscriptions).values({
			plan: "pro",
			referenceId: membership.organizationId,
			status: "active",
			billingInterval: "monthly",
			seats: 1,
		});
	}

	console.log(`Dev account ready: ${DEV_EMAIL} (onboarded, pro)`);
}

/**
 * Register the CLI's OAuth client.
 *
 * `superset auth login` authorises as a fixed `client_id`, so the row has to
 * exist before the flow can start — without it the authorize endpoint answers
 * `invalid_client` and login dies before the browser opens. Production has one
 * registered out-of-band; locally there was nothing, which is why CLI login
 * against a dev API had never worked.
 *
 * A public client: no secret, PKCE carries the proof instead. The redirect URIs
 * mirror `packages/cli/src/lib/auth.ts` — one per loopback port it may bind,
 * plus the paste-the-code fallback on the web app for when none are free.
 */
async function seedCliOAuthClient(): Promise<void> {
	const registration = {
		name: "Superset CLI",
		redirectUris: CLI_REDIRECT_URIS,
		grantTypes: ["authorization_code", "refresh_token"],
		responseTypes: ["code"],
		scopes: ["openid", "profile", "email", "offline_access"],
		tokenEndpointAuthMethod: "none",
		public: true,
		disabled: false,
		updatedAt: new Date(),
	};

	const existing = await db.query.oauthClients.findFirst({
		where: eq(oauthClients.clientId, CLI_CLIENT_ID),
	});

	// Refreshed rather than skipped: a row seeded against an older web URL or
	// port list outlives the change and fails the next login.
	if (existing) {
		await db
			.update(oauthClients)
			.set(registration)
			.where(eq(oauthClients.clientId, CLI_CLIENT_ID));
		console.log(`Refreshed CLI OAuth client: ${CLI_CLIENT_ID}`);
		return;
	}

	await db.insert(oauthClients).values({
		clientId: CLI_CLIENT_ID,
		...registration,
		createdAt: new Date(),
	});
	console.log(`Seeded CLI OAuth client: ${CLI_CLIENT_ID}`);
}

seedDevAccount()
	.then(() => seedCliOAuthClient())
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("seed-dev failed:", error);
		process.exit(1);
	});
