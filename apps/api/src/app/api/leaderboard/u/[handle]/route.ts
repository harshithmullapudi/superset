import { getParticipant } from "@superset/trpc/leaderboard-queries";

import {
	LEADERBOARD_CACHE_SECONDS,
	parseDayKey,
	parsePeriod,
	publicError,
	publicJson,
	publicRoute,
	rateLimited,
} from "@/lib/leaderboardResponse";

export const dynamic = "force-dynamic";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ handle: string }> },
): Promise<Response> {
	return publicRoute(async () => {
		const limited = await rateLimited(request);
		if (limited) return limited;

		const { handle } = await params;
		const search = new URL(request.url).searchParams;

		const profile = await getParticipant(handle, {
			period: parsePeriod(search.get("period"), "all"),
			periodStart: parseDayKey(search.get("periodStart")),
			from: parseDayKey(search.get("from")),
			to: parseDayKey(search.get("to")),
		});

		if (!profile) return publicError(404, "Not found");

		return publicJson(profile, LEADERBOARD_CACHE_SECONDS);
	});
}
