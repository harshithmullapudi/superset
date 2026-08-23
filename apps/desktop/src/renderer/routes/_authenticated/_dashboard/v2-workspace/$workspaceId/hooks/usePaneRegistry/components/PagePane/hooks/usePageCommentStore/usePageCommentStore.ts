import type { CommentStore, CommentThread } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

type ServerThread = {
	id: string;
	anchor: { path: string; tag: string } | null;
	anchorText: string | null;
	resolved: boolean;
	comments: {
		id: string;
		body: string;
		authorName: string;
		authorImage: string | null;
		createdAt: Date;
	}[];
};

/** Page-anchored threads have no element to sit on, so the overlay skips them. */
function toThreads(rows: ServerThread[]): CommentThread[] {
	return rows.flatMap((row) =>
		row.anchor
			? [
					{
						id: row.id,
						anchor: {
							path: row.anchor.path,
							tag: row.anchor.tag,
							text: row.anchorText ?? "",
						},
						resolved: row.resolved,
						comments: row.comments.map((comment) => ({
							id: comment.id,
							body: comment.body,
							authorName: comment.authorName,
							authorImage: comment.authorImage,
							createdAt: comment.createdAt.getTime(),
						})),
					},
				]
			: [],
	);
}

/** Desktop's half of the store seam, over the cloud client instead of the Next tRPC bindings. */
export function usePageCommentStore({
	pageId,
	version,
}: {
	pageId: string;
	version: number;
}): CommentStore {
	const utils = cloudTrpc.useUtils();
	const list = cloudTrpc.pageComment.list.useQuery({ pageId });

	const invalidate = useCallback(
		() => utils.pageComment.list.invalidate({ pageId }),
		[utils, pageId],
	);

	const handlers = useMemo(
		() => ({
			onSuccess: invalidate,
			onError: (error: { message: string }) => toast.error(error.message),
		}),
		[invalidate],
	);

	const create = cloudTrpc.pageComment.create.useMutation(handlers);
	const reply = cloudTrpc.pageComment.reply.useMutation(handlers);
	const edit = cloudTrpc.pageComment.edit.useMutation(handlers);
	const resolve = cloudTrpc.pageComment.resolve.useMutation(handlers);
	const remove = cloudTrpc.pageComment.delete.useMutation(handlers);

	const threads = useMemo(
		() => toThreads((list.data ?? []) as ServerThread[]),
		[list.data],
	);

	return useMemo<CommentStore>(
		() => ({
			threads,
			isLoading: list.isPending,
			// Returning `invalidate`'s promise makes the caller's await cover the refetch, not just the mutation.
			createThread: async ({ anchor, anchorText, body }) => {
				await create.mutateAsync({
					pageId,
					version,
					anchorKind: "element",
					anchor: { path: anchor.path, tag: anchor.tag },
					anchorText: anchorText.slice(0, 500) || null,
					body,
				});
			},
			addReply: async (threadId, body) => {
				await reply.mutateAsync({ threadId, body });
			},
			editComment: async (_threadId, commentId, body) => {
				await edit.mutateAsync({ commentId, body });
			},
			setResolved: async (threadId, resolved) => {
				await resolve.mutateAsync({ threadId, resolved });
			},
			deleteThread: async (threadId) => {
				await remove.mutateAsync({ threadId });
			},
		}),
		[
			threads,
			list.isPending,
			create,
			reply,
			edit,
			resolve,
			remove,
			pageId,
			version,
		],
	);
}
