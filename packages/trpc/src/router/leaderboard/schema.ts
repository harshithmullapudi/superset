import { z } from "zod";
import { LEADERBOARD_PERIODS } from "./periods";

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const tokenCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const handleSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(2)
	.max(39)
	.regex(
		/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/,
		"Letters, numbers and single dashes only",
	);

export const visibilitySchema = z.enum(["public", "hidden"]);

export const periodSchema = z.enum(LEADERBOARD_PERIODS);

export const joinSchema = z.object({
	handle: handleSchema,
	visibility: visibilitySchema.default("public"),
});

export const publishDaySchema = z.object({
	day: dayKey,
	provider: z.string().min(1).max(64),
	model: z.string().min(1).max(128),
	uncachedInput: tokenCount,
	cachedInput: tokenCount,
	cacheWrite5m: tokenCount,
	cacheWrite1h: tokenCount,
	output: tokenCount,
	reasoningOutput: tokenCount,
	usdEstimate: z.number().min(0).max(1_000_000),
	approximate: z.boolean(),
	sessions: z.number().int().min(0).max(100_000),
});

export type PublishDay = z.infer<typeof publishDaySchema>;

export const publishFactoryDaySchema = z.object({
	day: dayKey,
	sessions: z.number().int().min(0).max(100_000),

	parallelSessions: z.number().min(0).max(10_000),
	agentPrsMerged: z.number().int().min(0).max(10_000),
});

export type PublishFactoryDay = z.infer<typeof publishFactoryDaySchema>;

export const PUBLISH_MAX_DAYS = 5_000;

export const publishSchema = z.object({
	payloadVersion: z.union([z.literal(1), z.literal(2)]),
	hostId: z.string().min(1).max(128),
	days: z.array(publishDaySchema).max(PUBLISH_MAX_DAYS),
	factoryDays: z
		.array(publishFactoryDaySchema)
		.max(PUBLISH_MAX_DAYS)
		.default([]),
});

export const metricSchema = z.enum(["tokens", "cost"]);

export const standingsSchema = z.object({
	period: periodSchema.default("30d"),
	periodStart: dayKey.optional(),
	from: dayKey.optional(),
	to: dayKey.optional(),
	metric: metricSchema.default("tokens"),
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).max(100_000).default(0),
});

export const previewRankSchema = z.object({
	period: periodSchema.default("month"),
	periodStart: dayKey.optional(),
	tokens: tokenCount,
});

export const meSchema = z.object({
	period: periodSchema.default("month"),
	periodStart: dayKey.optional(),
});
