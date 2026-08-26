import type { LeaderboardPeriod } from "@superset/trpc/leaderboard-periods";
import { LEADERBOARD_PERIODS } from "@superset/trpc/leaderboard-periods";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

export const LEADERBOARD_CACHE_SECONDS = 300;
export const STATS_CACHE_SECONDS = 3600;

export function publicJson(body: unknown, maxAgeSeconds: number): Response {
	return Response.json(body, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=86400`,
		},
	});
}

export function publicError(status: number, message: string): Response {
	return Response.json(
		{ error: message },
		{ status, headers: { "Access-Control-Allow-Origin": "*" } },
	);
}

export async function publicRoute(
	handler: () => Promise<Response>,
): Promise<Response> {
	try {
		return await handler();
	} catch (error) {
		console.error("[api/leaderboard]", error);
		return publicError(500, "Internal server error");
	}
}

const redis =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN })
		: null;

const limiter = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(60, "1 m"),
			prefix: "ratelimit:leaderboard:public",
		})
	: null;

function clientKey(request: Request): string {
	return (
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		"unknown"
	);
}

export async function rateLimited(request: Request): Promise<Response | null> {
	if (!limiter) return null;
	const { success } = await limiter.limit(clientKey(request));
	if (success) return null;
	return publicError(429, "Rate limit exceeded");
}

export function parsePeriod(
	value: string | null,
	fallback: LeaderboardPeriod = "30d",
): LeaderboardPeriod {
	return (LEADERBOARD_PERIODS as readonly string[]).includes(value ?? "")
		? (value as LeaderboardPeriod)
		: fallback;
}

export function parseMetric(value: string | null): "tokens" | "cost" {
	return value === "cost" ? "cost" : "tokens";
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDayKey(value: string | null): string | undefined {
	if (!value || !DAY_KEY.test(value)) return undefined;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) return undefined;
	return parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

export function parseBoundedInt(
	value: string | null,
	fallback: number,
	min: number,
	max: number,
): number {
	const parsed = Number.parseInt(value ?? "", 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, parsed));
}
