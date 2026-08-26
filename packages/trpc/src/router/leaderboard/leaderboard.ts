import { db } from "@superset/db/client";
import {
	leaderboardDaily,
	leaderboardDailyFactory,
	leaderboardParticipants,
	userIdentities,
	users,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { env } from "../../env";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { isUniqueViolation } from "../utils/unique-violation";
import { type LeaderboardPeriod, resolveDayRange } from "./periods";
import { getStandings } from "./queries";
import {
	joinSchema,
	meSchema,
	previewRankSchema,
	publishSchema,
	standingsSchema,
} from "./schema";
import { computeTier, type FactoryDayRow, type Tier } from "./tier";

const redis =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN })
		: null;

const publishRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(30, "1 h"),
			prefix: "ratelimit:leaderboard:publish",
		})
	: null;

const joinRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(10, "1 h"),
			prefix: "ratelimit:leaderboard:join",
		})
	: null;

const previewRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(30, "1 h"),
			prefix: "ratelimit:leaderboard:preview",
		})
	: null;

async function enforce(
	limiter: Ratelimit | null,
	key: string,
	message: string,
): Promise<void> {
	if (!limiter) return;
	const { success } = await limiter.limit(key);
	if (!success) {
		throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
	}
}

function slugHandle(raw: string): string | null {
	const slug = raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 39)
		.replace(/-+$/g, "");
	return slug.length >= 2 ? slug : null;
}

const HANDLE_CONSTRAINT = "leaderboard_participants_handle_unique";

async function requireParticipant(userId: string) {
	const [row] = await db
		.select()
		.from(leaderboardParticipants)
		.where(eq(leaderboardParticipants.userId, userId))
		.limit(1);

	if (!row || row.revokedAt) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Not on the leaderboard. Opt in first.",
		});
	}
	return row;
}

async function recomputeTotals(userId: string): Promise<void> {
	const [agg] = await db
		.select({
			tokens: sql<number>`coalesce(sum(${leaderboardDaily.tokens}), 0)::bigint`,
			usd: sql<string>`coalesce(sum(${leaderboardDaily.usdEstimate}), 0)`,
			sessions: sql<number>`coalesce(sum(${leaderboardDaily.sessions}), 0)::int`,
			uncachedInput: sql<number>`coalesce(sum(${leaderboardDaily.uncachedInput}), 0)::bigint`,
			cachedInput: sql<number>`coalesce(sum(${leaderboardDaily.cachedInput}), 0)::bigint`,
			cacheWrite5m: sql<number>`coalesce(sum(${leaderboardDaily.cacheWrite5m}), 0)::bigint`,
			cacheWrite1h: sql<number>`coalesce(sum(${leaderboardDaily.cacheWrite1h}), 0)::bigint`,
			output: sql<number>`coalesce(sum(${leaderboardDaily.output}), 0)::bigint`,
			reasoningOutput: sql<number>`coalesce(sum(${leaderboardDaily.reasoningOutput}), 0)::bigint`,
			approximate: sql<boolean>`coalesce(bool_or(${leaderboardDaily.approximate}), false)`,
			dayRangeStart: sql<string | null>`min(${leaderboardDaily.day})`,
			dayRangeEnd: sql<string | null>`max(${leaderboardDaily.day})`,
		})
		.from(leaderboardDaily)
		.where(eq(leaderboardDaily.userId, userId));

	if (!agg) return;

	await db
		.update(leaderboardParticipants)
		.set({
			tokens: Number(agg.tokens),
			usd: String(agg.usd),
			sessions: Number(agg.sessions),
			uncachedInput: Number(agg.uncachedInput),
			cachedInput: Number(agg.cachedInput),
			cacheWrite5m: Number(agg.cacheWrite5m),
			cacheWrite1h: Number(agg.cacheWrite1h),
			output: Number(agg.output),
			reasoningOutput: Number(agg.reasoningOutput),
			approximate: agg.approximate,
			dayRangeStart: agg.dayRangeStart,
			dayRangeEnd: agg.dayRangeEnd,
			lastPublishedAt: new Date(),
		})
		.where(eq(leaderboardParticipants.userId, userId));
}

const TIER_WINDOW_DAYS = 30;

function tierWindowStart(now: Date = new Date()): string {
	const start = new Date(now);
	start.setUTCDate(start.getUTCDate() - (TIER_WINDOW_DAYS - 1));
	return start.toISOString().slice(0, 10);
}

async function recomputeTier(userId: string): Promise<void> {
	const from = tierWindowStart();

	const [factoryRows, tokenRows, current] = await Promise.all([
		db
			.select({
				day: leaderboardDailyFactory.day,
				sessions: sql<number>`coalesce(sum(${leaderboardDailyFactory.sessions}), 0)::int`,
				parallelSessions: sql<string>`coalesce(max(${leaderboardDailyFactory.parallelSessions}), 0)`,
				agentPrsMerged: sql<number>`coalesce(max(${leaderboardDailyFactory.agentPrsMerged}), 0)::int`,
			})
			.from(leaderboardDailyFactory)
			.where(
				and(
					eq(leaderboardDailyFactory.userId, userId),
					gte(leaderboardDailyFactory.day, from),
				),
			)
			.groupBy(leaderboardDailyFactory.day),
		db
			.select({
				day: leaderboardDaily.day,
				tokens: sql<number>`coalesce(sum(${leaderboardDaily.tokens}), 0)::bigint`,
			})
			.from(leaderboardDaily)
			.where(
				and(
					eq(leaderboardDaily.userId, userId),
					gte(leaderboardDaily.day, from),
				),
			)
			.groupBy(leaderboardDaily.day),
		db
			.select({ tier: leaderboardParticipants.tier })
			.from(leaderboardParticipants)
			.where(eq(leaderboardParticipants.userId, userId))
			.limit(1),
	]);

	const tokensByDay = new Map(
		tokenRows.map((row) => [row.day, Number(row.tokens)]),
	);

	const rows: FactoryDayRow[] = factoryRows.map((row) => ({
		day: row.day,
		tokens: tokensByDay.get(row.day) ?? 0,
		sessions: Number(row.sessions),
		parallelSessions: Number(row.parallelSessions),
		agentPrsMerged: Number(row.agentPrsMerged),
	}));

	const result = computeTier(rows, (current[0]?.tier ?? 0) as Tier);

	await db
		.update(leaderboardParticipants)
		.set({
			tier: result.tier,
			tierComputedAt: new Date(),
			activeDays: result.activeDays,
			axisWidth: result.axisWidth.toFixed(2),
			axisDepth: result.axisDepth,
			axisOutput: result.axisOutput.toFixed(2),
		})
		.where(eq(leaderboardParticipants.userId, userId));
}

async function rankFor(
	period: LeaderboardPeriod,
	periodStart: string | undefined,
	tokens: number,
	excludeUserId: string | null,
): Promise<{ rank: number; total: number }> {
	const range = resolveDayRange(period, periodStart);
	const exclude = excludeUserId
		? sql`and p.user_id <> ${excludeUserId}`
		: sql``;
	const eligible = sql`p.visibility = 'public' and p.revoked_at is null and u.deleted_at is null ${exclude}`;

	if (!range) {
		const rows = await db.execute<{ ahead: number; total: number }>(sql`
			select
				count(*) filter (where p.tokens > ${tokens})::int as ahead,
				count(*)::int as total
			from leaderboard_participants p
			join auth.users u on u.id = p.user_id
			where ${eligible} and p.tokens > 0
		`);
		const row = rows.rows[0];
		return {
			rank: Number(row?.ahead ?? 0) + 1,
			total: Number(row?.total ?? 0),
		};
	}

	const rows = await db.execute<{ ahead: number; total: number }>(sql`
		with totals as (
			select d.user_id, sum(d.tokens) as tokens
			from leaderboard_daily d
			join leaderboard_participants p on p.user_id = d.user_id
			join auth.users u on u.id = p.user_id
			where d.day between ${range.from} and ${range.to} and ${eligible}
			group by d.user_id
		)
		select
			count(*) filter (where tokens > ${tokens})::int as ahead,
			count(*)::int as total
		from totals
	`);
	const row = rows.rows[0];
	return { rank: Number(row?.ahead ?? 0) + 1, total: Number(row?.total ?? 0) };
}

export const leaderboardRouter = createTRPCRouter({
	join: protectedProcedure
		.input(joinSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			await enforce(
				joinRateLimit,
				userId,
				"Too many attempts. Try again later.",
			);

			const [taken] = await db
				.select({ userId: leaderboardParticipants.userId })
				.from(leaderboardParticipants)
				.where(eq(leaderboardParticipants.handle, input.handle))
				.limit(1);

			if (taken && taken.userId !== userId) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "That handle is taken.",
				});
			}

			const organizationId = await requireActiveOrgMembership(ctx);

			try {
				const [row] = await db
					.insert(leaderboardParticipants)
					.values({
						userId,
						handle: input.handle,
						visibility: input.visibility,
						organizationId,
					})
					.onConflictDoUpdate({
						target: leaderboardParticipants.userId,
						set: {
							handle: input.handle,
							visibility: input.visibility,
							organizationId,
							revokedAt: null,
							optedInAt: new Date(),
						},
					})
					.returning();

				return row;
			} catch (error) {
				if (isUniqueViolation(error, HANDLE_CONSTRAINT)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "That handle is taken.",
					});
				}
				throw error;
			}
		}),

	suggestedHandle: protectedProcedure.query(async ({ ctx }) => {
		const userId = ctx.session.user.id;

		const [identity] = await db
			.select({ handle: userIdentities.handle })
			.from(userIdentities)
			.where(
				and(
					eq(userIdentities.userId, userId),
					eq(userIdentities.provider, "github"),
				),
			)
			.limit(1);

		const [account] = await db
			.select({ name: users.name, email: users.email })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		const candidate =
			identity?.handle ??
			account?.name ??
			account?.email?.split("@")[0] ??
			null;
		const suggestion = candidate ? slugHandle(candidate) : null;
		if (!suggestion) return { handle: null, taken: false, source: null };

		const [clash] = await db
			.select({ userId: leaderboardParticipants.userId })
			.from(leaderboardParticipants)
			.where(eq(leaderboardParticipants.handle, suggestion))
			.limit(1);

		return {
			handle: suggestion,
			taken: Boolean(clash && clash.userId !== userId),
			source: identity?.handle ? ("github" as const) : ("account" as const),
		};
	}),

	setVisibility: protectedProcedure
		.input(joinSchema.pick({ visibility: true }))
		.mutation(async ({ ctx, input }) => {
			await requireParticipant(ctx.session.user.id);
			await db
				.update(leaderboardParticipants)
				.set({ visibility: input.visibility })
				.where(eq(leaderboardParticipants.userId, ctx.session.user.id));
			return { success: true };
		}),

	leave: protectedProcedure.mutation(async ({ ctx }) => {
		const userId = ctx.session.user.id;
		await db
			.delete(leaderboardDaily)
			.where(eq(leaderboardDaily.userId, userId));
		await db
			.delete(leaderboardParticipants)
			.where(eq(leaderboardParticipants.userId, userId));
		return { success: true };
	}),

	publish: protectedProcedure
		.input(publishSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await enforce(
				publishRateLimit,
				userId,
				"Too many publishes. Try again later.",
			);
			await requireParticipant(userId);

			if (input.days.length === 0 && input.factoryDays.length === 0) {
				return { written: 0, days: 0 };
			}

			const rows = input.days.map((day) => ({
				userId,
				day: day.day,
				provider: day.provider,
				model: day.model,
				hostId: input.hostId,
				uncachedInput: day.uncachedInput,
				cachedInput: day.cachedInput,
				cacheWrite5m: day.cacheWrite5m,
				cacheWrite1h: day.cacheWrite1h,
				output: day.output,
				reasoningOutput: day.reasoningOutput,

				tokens:
					day.uncachedInput +
					day.cachedInput +
					day.cacheWrite5m +
					day.cacheWrite1h +
					day.output,
				usdEstimate: day.usdEstimate.toFixed(6),
				approximate: day.approximate,
				sessions: day.sessions,
			}));

			if (rows.length > 0) {
				await db
					.insert(leaderboardDaily)
					.values(rows)
					.onConflictDoUpdate({
						target: [
							leaderboardDaily.userId,
							leaderboardDaily.day,
							leaderboardDaily.provider,
							leaderboardDaily.model,
							leaderboardDaily.hostId,
						],
						set: {
							uncachedInput: sql`excluded.uncached_input`,
							cachedInput: sql`excluded.cached_input`,
							cacheWrite5m: sql`excluded.cache_write_5m`,
							cacheWrite1h: sql`excluded.cache_write_1h`,
							output: sql`excluded.output`,
							reasoningOutput: sql`excluded.reasoning_output`,
							tokens: sql`excluded.tokens`,
							usdEstimate: sql`excluded.usd_estimate`,
							approximate: sql`excluded.approximate`,
							sessions: sql`excluded.sessions`,
							updatedAt: new Date(),
						},
					});
			}

			if (input.factoryDays.length > 0) {
				await db
					.insert(leaderboardDailyFactory)
					.values(
						input.factoryDays.map((day) => ({
							userId,
							day: day.day,
							hostId: input.hostId,
							sessions: day.sessions,
							parallelSessions: day.parallelSessions.toFixed(2),
							agentPrsMerged: day.agentPrsMerged,
						})),
					)
					.onConflictDoUpdate({
						target: [
							leaderboardDailyFactory.userId,
							leaderboardDailyFactory.day,
							leaderboardDailyFactory.hostId,
						],
						set: {
							sessions: sql`excluded.sessions`,
							parallelSessions: sql`excluded.parallel_sessions`,
							agentPrsMerged: sql`excluded.agent_prs_merged`,
							updatedAt: new Date(),
						},
					});
			}

			await recomputeTotals(userId);
			await recomputeTier(userId);
			const distinctDays = new Set([
				...input.days.map((day) => day.day),
				...input.factoryDays.map((day) => day.day),
			]).size;
			return { written: rows.length, days: distinctDays };
		}),

	standings: protectedProcedure
		.input(standingsSchema)
		.query(async ({ input }) => await getStandings(input)),

	previewRank: protectedProcedure
		.input(previewRankSchema)
		.query(async ({ ctx, input }) => {
			await enforce(
				previewRateLimit,
				ctx.session.user.id,
				"Too many rank previews. Try again later.",
			);

			const { rank, total } = await rankFor(
				input.period,
				input.periodStart,
				input.tokens,
				ctx.session.user.id,
			);

			return {
				rank,

				total: total + 1,
				percentile:
					total > 0 ? Math.round((1 - (rank - 1) / total) * 100) : null,
			};
		}),

	me: protectedProcedure.input(meSchema).query(async ({ ctx, input }) => {
		const userId = ctx.session.user.id;
		const [row] = await db
			.select()
			.from(leaderboardParticipants)
			.where(eq(leaderboardParticipants.userId, userId))
			.limit(1);

		if (!row || row.revokedAt) return null;

		const range = resolveDayRange(input.period, input.periodStart);
		let tokens = row.tokens;

		if (range) {
			const [agg] = await db
				.select({
					tokens: sql<number>`coalesce(sum(${leaderboardDaily.tokens}), 0)::bigint`,
				})
				.from(leaderboardDaily)
				.where(
					and(
						eq(leaderboardDaily.userId, userId),
						gte(leaderboardDaily.day, range.from),
						lte(leaderboardDaily.day, range.to),
					),
				);
			tokens = Number(agg?.tokens ?? 0);
		}

		const { rank, total } = await rankFor(
			input.period,
			input.periodStart,
			tokens,
			userId,
		);

		return {
			handle: row.handle,
			visibility: row.visibility,
			lastPublishedAt: row.lastPublishedAt,
			period: input.period,
			range,
			tokens,
			usd: row.usd,
			sessions: row.sessions,
			approximate: row.approximate,
			rank,
			total: total + 1,
		};
	}),
});
