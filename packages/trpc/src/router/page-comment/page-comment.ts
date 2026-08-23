import { db, dbWs } from "@superset/db/client";
import {
	pageComments,
	pageCommentThreads,
	pages,
	pageVersions,
	type SelectPage,
	users,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { assertPageReadable } from "../page/access";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	createPageCommentThreadSchema,
	deletePageCommentThreadSchema,
	editPageCommentSchema,
	listPageCommentsSchema,
	replyPageCommentSchema,
	resolvePageCommentThreadSchema,
} from "./schema";

/** Anyone who can read a page may comment on it; there is no separate grant. */
async function loadReadablePage({
	pageId,
	organizationId,
	userId,
}: {
	pageId: string;
	organizationId: string;
	userId: string;
}): Promise<SelectPage> {
	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.organizationId, organizationId), eq(pages.id, pageId)))
		.limit(1);

	if (!page) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
	}
	assertPageReadable(page, userId);
	return page;
}

// Loads a thread with its page, so every mutation re-checks readability rather than trusting a thread id.
async function loadThread({
	threadId,
	organizationId,
	userId,
}: {
	threadId: string;
	organizationId: string;
	userId: string;
}) {
	const [row] = await db
		.select({ thread: pageCommentThreads, page: pages })
		.from(pageCommentThreads)
		.innerJoin(pages, eq(pages.id, pageCommentThreads.pageId))
		.where(
			and(
				eq(pageCommentThreads.id, threadId),
				eq(pages.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
	}
	assertPageReadable(row.page, userId);
	return row;
}

export const pageCommentRouter = {
	// One round trip: the viewer needs every anchor at once, and no page carries enough to paginate.
	list: protectedProcedure
		.input(listPageCommentsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage({ pageId: input.pageId, organizationId, userId });

			const threadRows = await db
				.select()
				.from(pageCommentThreads)
				.where(eq(pageCommentThreads.pageId, input.pageId))
				.orderBy(asc(pageCommentThreads.createdAt));

			if (threadRows.length === 0) return [];

			const commentRows = await db
				.select({
					comment: pageComments,
					authorName: users.name,
					authorImage: users.image,
				})
				.from(pageComments)
				.innerJoin(
					pageCommentThreads,
					eq(pageCommentThreads.id, pageComments.threadId),
				)
				.leftJoin(users, eq(users.id, pageComments.authorUserId))
				.where(
					and(
						eq(pageCommentThreads.pageId, input.pageId),
						// Soft-deleted comments stay for audit but never render.
						isNull(pageComments.deletedAt),
					),
				)
				.orderBy(asc(pageComments.createdAt));

			// One pass rather than re-scanning per thread; insertion order is the query's `created_at` order.
			const byThread = new Map<string, typeof commentRows>();
			for (const row of commentRows) {
				const existing = byThread.get(row.comment.threadId);
				if (existing) existing.push(row);
				else byThread.set(row.comment.threadId, [row]);
			}

			return threadRows.map((thread) => ({
				id: thread.id,
				anchorKind: thread.anchorKind,
				anchor: thread.anchor as { path: string; tag: string } | null,
				anchorText: thread.anchorText,
				resolved: thread.resolvedAt !== null,
				createdAt: thread.createdAt,
				comments: (byThread.get(thread.id) ?? []).map((row) => ({
					id: row.comment.id,
					body: row.comment.body,
					authorKind: row.comment.authorKind,
					// A deleted account leaves its comments behind.
					authorName: row.authorName ?? "Unknown",
					authorImage: row.authorImage ?? null,
					createdAt: row.comment.createdAt,
				})),
			}));
		}),

	create: protectedProcedure
		.input(createPageCommentThreadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage({ pageId: input.pageId, organizationId, userId });

			// Resolved here because the caller knows which version it rendered, not which row id that is.
			const [version] = await db
				.select({ id: pageVersions.id })
				.from(pageVersions)
				.where(
					and(
						eq(pageVersions.pageId, input.pageId),
						eq(pageVersions.version, input.version),
					),
				)
				.limit(1);

			if (!version) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Version ${input.version} not found`,
				});
			}

			return await dbWs.transaction(async (tx) => {
				const [thread] = await tx
					.insert(pageCommentThreads)
					.values({
						pageId: input.pageId,
						pageVersionId: version.id,
						anchorKind: input.anchorKind,
						anchor: input.anchor,
						anchorText: input.anchorText,
						createdByUserId: userId,
					})
					.returning();

				if (!thread) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create thread",
					});
				}

				const [comment] = await tx
					.insert(pageComments)
					.values({
						threadId: thread.id,
						authorKind: "human",
						authorUserId: userId,
						body: input.body,
					})
					.returning();

				return { threadId: thread.id, commentId: comment?.id };
			});
		}),

	reply: protectedProcedure
		.input(replyPageCommentSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadThread({ threadId: input.threadId, organizationId, userId });

			const [comment] = await db
				.insert(pageComments)
				.values({
					threadId: input.threadId,
					authorKind: input.agentSessionId ? "agent" : "human",
					// Recorded either way: an agent reply is still made on someone's behalf.
					authorUserId: userId,
					agentSessionId: input.agentSessionId ?? null,
					body: input.body,
				})
				.returning();

			return { id: comment?.id };
		}),

	// Author only: editing someone else's words in place would be indistinguishable from them writing it.
	edit: protectedProcedure
		.input(editPageCommentSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const [existing] = await db
				.select({ comment: pageComments, page: pages })
				.from(pageComments)
				.innerJoin(
					pageCommentThreads,
					eq(pageCommentThreads.id, pageComments.threadId),
				)
				.innerJoin(pages, eq(pages.id, pageCommentThreads.pageId))
				.where(
					and(
						eq(pageComments.id, input.commentId),
						eq(pages.organizationId, organizationId),
						isNull(pageComments.deletedAt),
					),
				)
				.limit(1);

			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Comment not found",
				});
			}
			assertPageReadable(existing.page, userId);
			if (existing.comment.authorUserId !== userId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the author can edit a comment",
				});
			}

			await db
				.update(pageComments)
				.set({ body: input.body })
				.where(eq(pageComments.id, input.commentId));

			return { id: input.commentId };
		}),

	// Anyone who can read the page may resolve: that is a statement about the page, not the comment.
	resolve: protectedProcedure
		.input(resolvePageCommentThreadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadThread({ threadId: input.threadId, organizationId, userId });

			await db
				.update(pageCommentThreads)
				.set(
					input.resolved
						? { resolvedAt: new Date(), resolvedByUserId: userId }
						: { resolvedAt: null, resolvedByUserId: null },
				)
				.where(eq(pageCommentThreads.id, input.threadId));

			return { id: input.threadId, resolved: input.resolved };
		}),

	// Thread starter or page owner, so a reader cannot erase a colleague's feedback.
	delete: protectedProcedure
		.input(deletePageCommentThreadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const { thread, page } = await loadThread({
				threadId: input.threadId,
				organizationId,
				userId,
			});

			if (
				thread.createdByUserId !== userId &&
				page.createdByUserId !== userId
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the thread's author or the page's owner can delete it",
				});
			}

			await db
				.delete(pageCommentThreads)
				.where(eq(pageCommentThreads.id, input.threadId));

			return { id: input.threadId };
		}),
} satisfies TRPCRouterRecord;
