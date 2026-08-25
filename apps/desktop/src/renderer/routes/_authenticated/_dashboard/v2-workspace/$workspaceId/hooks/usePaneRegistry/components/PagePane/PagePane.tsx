import { authClient } from "@superset/auth/client";
import { CommentProvider, PageCommentsView } from "@superset/ui/page-comments";
import { Spinner } from "@superset/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { PagePaneData } from "../../../../types";
import { PagePaneMessage } from "./components/PagePaneMessage";
import { usePageCommentStore } from "./hooks/usePageCommentStore";
import { usePagePaneUi } from "./hooks/usePagePaneUi";

interface PagePaneProps {
	data: PagePaneData;
	paneId: string;
	onDataChange: (data: PagePaneData) => void;
}

export function PagePane({ data, paneId, onDataChange }: PagePaneProps) {
	const { data: session } = authClient.useSession();
	const pull = cloudTrpc.page.pull.useQuery(
		data.pageId ? { id: data.pageId } : { slug: data.slug },
	);
	const downloadUrl = pull.data?.downloadUrl;
	const pageId = data.pageId ?? pull.data?.id;
	const title = data.title ?? pull.data?.title ?? data.slug;
	const store = usePageCommentStore({
		pageId: pageId ?? "",
		version: pull.data?.version ?? 0,
	});

	const { commentsEnabled, setCommentsEnabled } = usePagePaneUi(paneId);

	const onDataChangeRef = useRef(onDataChange);
	onDataChangeRef.current = onDataChange;
	const resolved = pull.data;
	useEffect(() => {
		if (!resolved) return;
		if (data.pageId === resolved.id && data.title === resolved.title) return;
		onDataChangeRef.current({
			slug: resolved.slug,
			pageId: resolved.id,
			title: resolved.title ?? undefined,
		});
	}, [resolved, data.pageId, data.title]);

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
		const missing =
			pull.error instanceof TRPCClientError &&
			pull.error.data?.code === "NOT_FOUND";
		return (
			<PagePaneMessage
				title={
					missing
						? "This page no longer exists"
						: "This page could not be opened"
				}
				description={
					missing
						? "It may have been deleted, or it belongs to another organization."
						: (pull.error?.message ?? content.error?.message)
				}
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
			enabled={commentsEnabled}
			onEnabledChange={setCommentsEnabled}
			user={{
				id: session?.user.id ?? "",
				name: session?.user.name ?? "You",
				image: session?.user.image ?? null,
			}}
		>
			<div className="flex h-full w-full flex-col">
				<div className="min-h-0 min-w-0 flex-1">
					<PageCommentsView
						html={content.data}
						title={title}
						serveHtml={serveHtml}
					/>
				</div>
			</div>
		</CommentProvider>
	);
}
