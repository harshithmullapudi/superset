import { auth } from "@superset/auth/server";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { headers } from "next/headers";
import { PostHog } from "posthog-node";
import { cache } from "react";

import { env } from "@/env";

const posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
	host: env.NEXT_PUBLIC_POSTHOG_HOST,
	flushAt: 1,
	flushInterval: 0,
});

/** Resolves the viewer and whether Pages is on for them. */
export const getPagesAccess = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		return { hasPagesAccess: false, session: null };
	}

	let hasPagesAccess = false;

	try {
		hasPagesAccess = Boolean(
			await posthog.getFeatureFlag(
				FEATURE_FLAGS.PAGES,
				session.user.id,
				// Passed rather than read from the stored profile so an email release condition resolves before the client's identify is ingested.
				{ personProperties: { email: session.user.email } },
			),
		);
	} catch (error) {
		console.error("[pages] Failed to load the pages feature flag", error);
	}

	return { hasPagesAccess, session };
});
