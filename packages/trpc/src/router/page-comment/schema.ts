import { z } from "zod";

/** `text` exists in the column enum, but the viewer places no quote-range anchors yet. */
export const OFFERED_ANCHOR_KINDS = ["element", "page"] as const;

/** Mirrors what the injected runtime reports; `path` means nothing outside the browser that produced it. */
export const elementAnchorSchema = z.object({
	path: z.string().min(1).max(2000),
	tag: z.string().min(1).max(40),
});

export const listPageCommentsSchema = z.object({
	pageId: z.string().uuid(),
	// Optional: a viewer scopes to the bytes on screen, agent tooling reads every thread.
	version: z.number().int().positive().optional(),
});

export const createPageCommentThreadSchema = z
	.object({
		pageId: z.string().uuid(),
		/** Version number as served; the row id is resolved server-side. */
		version: z.number().int().positive(),
		anchorKind: z.enum(OFFERED_ANCHOR_KINDS),
		anchor: elementAnchorSchema.nullable().default(null),
		anchorText: z.string().max(500).nullable().default(null),
		body: z.string().min(1).max(10_000),
	})
	.refine(
		(input) => (input.anchorKind === "page") === (input.anchor === null),
		{
			message:
				"An element thread needs an anchor; a page thread must not have one",
			path: ["anchor"],
		},
	);

export const replyPageCommentSchema = z.object({
	threadId: z.string().uuid(),
	body: z.string().min(1).max(10_000),
	/**
	 * Set only by a non-human caller (the CLI, from `$SUPERSET_PANE_ID`), which
	 * stamps the reply as agent-authored. The account behind the call is still
	 * recorded, so every row traces back to a person.
	 */
	agentSessionId: z.string().min(1).max(200).optional(),
});

export const editPageCommentSchema = z.object({
	commentId: z.string().uuid(),
	body: z.string().min(1).max(10_000),
});

export const resolvePageCommentThreadSchema = z.object({
	threadId: z.string().uuid(),
	resolved: z.boolean(),
});

export const deletePageCommentThreadSchema = z.object({
	threadId: z.string().uuid(),
});
