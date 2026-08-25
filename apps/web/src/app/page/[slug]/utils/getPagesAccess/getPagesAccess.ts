import { auth } from "@superset/auth/server";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { headers } from "next/headers";
import { cache } from "react";

import { posthogServer } from "@/lib/posthog-server";

export const getPagesAccess = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		return { hasPagesAccess: false, session: null };
	}

	let hasPagesAccess = false;

	try {
		const flag = await posthogServer.getFeatureFlag(
			FEATURE_FLAGS.PAGES,
			session.user.id,
			{ personProperties: { email: session.user.email } },
		);
		// TEMP DEBUG — remove with the override below.
		console.log("[pages] flag check", {
			flag,
			type: typeof flag,
			userId: session.user.id,
			key: FEATURE_FLAGS.PAGES,
		});
		hasPagesAccess = Boolean(flag);
	} catch (error) {
		console.error("[pages] Failed to load the pages feature flag", error);
	}

	// TEMP OVERRIDE — forces the page viewer open regardless of the PostHog
	// flag, to confirm the flag is the only thing 404ing published pages.
	// REVERT BEFORE MERGING: delete this block and the TEMP DEBUG log above.
	if (!hasPagesAccess) {
		console.warn("[pages] TEMP OVERRIDE: granting access despite flag=false");
		hasPagesAccess = true;
	}

	return { hasPagesAccess, session };
});
