import { authClient } from "@superset/auth/client";
import {
	CommentModeToggle,
	CommentProvider,
	PageCommentsView,
} from "@superset/ui/page-comments";
import { Pixel404 } from "@superset/ui/pixel-404";
import { Spinner } from "@superset/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type { PagePaneData } from "../../../../types";
import { PageHandoffMenu } from "./components/PageHandoffMenu";
import { PageVisibilityMenu } from "./components/PageVisibilityMenu";
import { usePageCommentStore } from "./hooks/usePageCommentStore";

interface PagePaneProps {
	data: PagePaneData;
}

// No logo or home button, unlike the web viewer: this is a pane inside the app,
// so the chrome around it is already ours.
function PagePaneMessage({
	title,
	description,
	notFound,
}: {
	title: string;
	description?: string;
	notFound?: boolean;
}) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
			{notFound ? (
				<Pixel404 className="max-w-[200px] pb-3 text-foreground" />
			) : null}
			<p className="font-medium text-sm">{title}</p>
			{description ? (
				<p className="max-w-xs text-balance text-muted-foreground text-xs">
					{description}
				</p>
			) : null}
		</div>
	);
}

export function PagePane({ data }: PagePaneProps) {
	const { workspace } = useWorkspace();
	const { data: session } = authClient.useSession();
	const pull = cloudTrpc.page.pull.useQuery({ id: data.pageId });
	const downloadUrl = pull.data?.downloadUrl;
	// Threads are versioned against the bytes on screen, so the store waits for `pull`.
	const store = usePageCommentStore({
		pageId: data.pageId,
		version: pull.data?.version ?? 0,
	});

	// Fetched client-side: the blob is public and the renderer has no server to proxy through.
	const content = useQuery({
		queryKey: ["page-content", downloadUrl],
		enabled: Boolean(downloadUrl),
		queryFn: async () => {
			const response = await fetch(downloadUrl as string, {
				cache: "no-store",
			});
			if (!response.ok) {
				throw new Error(`Page content failed to load (${response.status})`);
			}
			return response.text();
		},
	});

	// `srcdoc` would inherit this window's CSP and lose all inline script, so main serves the bytes under their own.
	const servedToken = useRef<string | null>(null);
	const serveHtml = useCallback(async (injectedHtml: string) => {
		if (servedToken.current) {
			void electronTrpcClient.pageContent.release.mutate({
				token: servedToken.current,
			});
		}
		const { token, url } = await electronTrpcClient.pageContent.register.mutate(
			{ html: injectedHtml },
		);
		servedToken.current = token;
		return url;
	}, []);

	useEffect(
		() => () => {
			if (servedToken.current) {
				void electronTrpcClient.pageContent.release.mutate({
					token: servedToken.current,
				});
				servedToken.current = null;
			}
		},
		[],
	);

	if (pull.error || content.error) {
		// A deleted page and a blob that would not load are different dead ends,
		// and only the first is a 404 — saying so beats one message for both.
		const missing =
			pull.error instanceof TRPCClientError &&
			pull.error.data?.code === "NOT_FOUND";
		return missing ? (
			<PagePaneMessage
				notFound
				title="This page isn't here"
				description="It may have been deleted, or you may not have access to it."
			/>
		) : (
			<PagePaneMessage
				title="This page could not be opened"
				description={pull.error?.message ?? content.error?.message}
			/>
		);
	}

	if (!content.data) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Spinner className="size-4" />
			</div>
		);
	}

	return (
		<CommentProvider
			store={store}
			user={{
				id: session?.user.id ?? "",
				name: session?.user.name ?? "You",
				image: session?.user.image ?? null,
			}}
		>
			<div className="flex h-full w-full flex-col">
				{/* The toggle lives here rather than in the pane header because the
				    registry renders header extras in a sibling subtree, outside this
				    provider. Keeping both controls together also keeps them next to
				    the content they act on. */}
				<div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b px-2">
					{pull.data ? (
						<PageVisibilityMenu
							pageId={data.pageId}
							visibility={
								pull.data.visibility === "just_me" ? "just_me" : "org"
							}
							createdByUserId={pull.data.createdByUserId}
						/>
					) : null}
					<PageHandoffMenu
						workspaceId={workspace.id}
						pageTitle={data.title}
						pageSlug={data.slug}
					/>
					<CommentModeToggle />
				</div>
				<div className="min-h-0 min-w-0 flex-1">
					<PageCommentsView
						html={content.data}
						title={data.title}
						serveHtml={serveHtml}
					/>
				</div>
			</div>
		</CommentProvider>
	);
}
