import { z } from "zod";

/** Narrower than the database enum: `everyone` needs a pages origin to enforce it, which does not exist yet. */
export const OFFERED_VISIBILITIES = ["just_me", "org"] as const;

const publishPageFieldsSchema = z.object({
	/** Base64-encoded file bytes. Accepts a bare payload or a data: URL. */
	content: z.string().min(1),
	contentType: z.string().min(1),
	filename: z.string().min(1).max(255),
	/** Path relative to the workspace root; with `workspaceId` this is the republish lookup key. */
	entryPath: z.string().min(1).max(1024).optional(),
	/** Whatever $SUPERSET_WORKSPACE_ID names — cloud sandbox or local machine. */
	workspaceId: z.string().uuid().optional(),
	/** Explicit republish target. Wins over the workspace lookup. */
	pageId: z.string().uuid().optional(),
	title: z.string().min(1).max(200).optional(),
	description: z.string().max(2000).optional(),
	/** What changed in this version. Display-only; never rewritten. */
	label: z.string().max(200).optional(),
	visibility: z.enum(OFFERED_VISIBILITIES).optional(),
});

export const publishPageSchema = publishPageFieldsSchema.refine(
	(value) => Boolean(value.workspaceId) === Boolean(value.entryPath),
	{
		// Half a link is silently no link: the page never reaches the workspace's
		// Pages tab, and a later publish cannot reuse the edge as a new version.
		message: "workspaceId and entryPath must be provided together",
		path: ["entryPath"],
	},
);

export type PublishPageInput = z.infer<typeof publishPageSchema>;

export const listPagesSchema = z
	.object({ workspaceId: z.string().uuid().optional() })
	.optional();

/** Pages are addressable by either identifier: id internally, slug in URLs. */
export const pageRefSchema = z
	.object({
		id: z.string().uuid().optional(),
		slug: z.string().min(1).max(120).optional(),
	})
	.refine((value) => Boolean(value.id ?? value.slug), {
		message: "Provide either id or slug",
	});

export const setPageVisibilitySchema = z.object({
	id: z.string().uuid(),
	visibility: z.enum(OFFERED_VISIBILITIES),
});

export const pullPageSchema = z.object({
	id: z.string().uuid(),
	/** Omit to pull whichever version is currently served. */
	version: z.number().int().positive().optional(),
});
