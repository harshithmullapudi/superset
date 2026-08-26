import { getStandings } from "@superset/trpc/leaderboard-queries";

import {
	LEADERBOARD_CACHE_SECONDS,
	parseBoundedInt,
	parseDayKey,
	parseMetric,
	parsePeriod,
	publicJson,
	publicRoute,
	rateLimited,
} from "@/lib/leaderboardResponse";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	return publicRoute(async () => {
		const limited = await rateLimited(request);
		if (limited) return limited;

		const params = new URL(request.url).searchParams;
		const result = await getStandings({
			period: parsePeriod(params.get("period")),
			periodStart: parseDayKey(params.get("periodStart")),
			from: parseDayKey(params.get("from")),
			to: parseDayKey(params.get("to")),
			metric: parseMetric(params.get("metric")),
			limit: parseBoundedInt(params.get("limit"), 50, 1, 100),
			offset: parseBoundedInt(params.get("offset"), 0, 0, 100_000),
		});

		return publicJson(result, LEADERBOARD_CACHE_SECONDS);
	});
}
