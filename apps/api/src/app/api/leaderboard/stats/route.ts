import { getStats } from "@superset/trpc/leaderboard-queries";

import {
	parseDayKey,
	parsePeriod,
	publicJson,
	rateLimited,
	STATS_CACHE_SECONDS,
} from "@/lib/leaderboardResponse";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	const limited = await rateLimited(request);
	if (limited) return limited;

	const params = new URL(request.url).searchParams;
	const stats = await getStats({
		period: parsePeriod(params.get("period")),
		periodStart: parseDayKey(params.get("periodStart")),
		from: parseDayKey(params.get("from")),
		to: parseDayKey(params.get("to")),
	});

	return publicJson(stats, STATS_CACHE_SECONDS);
}
