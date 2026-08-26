import type { LeaderboardPeriod } from "@superset/trpc/leaderboard-periods";
import type {
	LeaderboardMetric,
	LeaderboardStats as LeaderboardStatsPayload,
	ParticipantProfile as ParticipantProfilePayload,
	StandingsResult,
} from "@superset/trpc/leaderboard-types";
import { env } from "@/env";

const REVALIDATE_SECONDS = 300;

type Jsonified<T> = T extends Date
	? string
	: T extends Array<infer U>
		? Array<Jsonified<U>>
		: T extends object
			? { [K in keyof T]: Jsonified<T[K]> }
			: T;

export type { LeaderboardMetric, LeaderboardPeriod };

export type StandingRow = Jsonified<StandingsResult["rows"][number]>;
export type Standings = Jsonified<StandingsResult>;

export type LeaderboardStats = Omit<
	Jsonified<LeaderboardStatsPayload>,
	"tiers"
> & {
	tiers?: Jsonified<LeaderboardStatsPayload>["tiers"];
};

export type ParticipantProfile = Omit<
	Jsonified<ParticipantProfilePayload>,
	"factory"
> & {
	factory?: Jsonified<ParticipantProfilePayload>["factory"];
};

export interface RangeQuery {
	period?: LeaderboardPeriod;
	from?: string;
	to?: string;
}

function buildQuery(params: Record<string, string | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value) search.set(key, value);
	}
	return search.toString();
}

export async function fetchStandings(
	options: RangeQuery & {
		metric?: LeaderboardMetric;
		limit?: number;
		offset?: number;
	} = {},
): Promise<Standings | null> {
	const query = buildQuery({
		period: options.period,
		from: options.from,
		to: options.to,
		metric: options.metric,
		limit: options.limit ? String(options.limit) : undefined,
		offset: options.offset ? String(options.offset) : undefined,
	});

	try {
		const response = await fetch(
			`${env.NEXT_PUBLIC_API_URL}/api/leaderboard?${query}`,
			{ next: { revalidate: REVALIDATE_SECONDS } },
		);
		if (!response.ok) {
			console.error(
				"[marketing/leaderboard] standings failed:",
				response.status,
			);
			return null;
		}
		return (await response.json()) as Standings;
	} catch (error) {
		console.error("[marketing/leaderboard] standings error:", error);
		return null;
	}
}

export async function fetchStats(
	options: RangeQuery = {},
): Promise<LeaderboardStats | null> {
	const query = buildQuery({
		period: options.period,
		from: options.from,
		to: options.to,
	});

	try {
		const response = await fetch(
			`${env.NEXT_PUBLIC_API_URL}/api/leaderboard/stats?${query}`,
			{ next: { revalidate: REVALIDATE_SECONDS } },
		);
		if (!response.ok) {
			console.error("[marketing/leaderboard] stats failed:", response.status);
			return null;
		}
		return (await response.json()) as LeaderboardStats;
	} catch (error) {
		console.error("[marketing/leaderboard] stats error:", error);
		return null;
	}
}

export async function fetchParticipant(
	handle: string,
	options: RangeQuery = {},
): Promise<ParticipantProfile | null> {
	const query = buildQuery({
		period: options.period,
		from: options.from,
		to: options.to,
	});

	try {
		const response = await fetch(
			`${env.NEXT_PUBLIC_API_URL}/api/leaderboard/u/${encodeURIComponent(handle)}?${query}`,
			{ next: { revalidate: REVALIDATE_SECONDS } },
		);
		if (!response.ok) return null;
		return (await response.json()) as ParticipantProfile;
	} catch (error) {
		console.error("[marketing/leaderboard] profile error:", error);
		return null;
	}
}
