import type { WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMatchRoute } from "@tanstack/react-router";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface PagePaneLike {
	slug?: string;
	pageId?: string;
}

function activePagePane(
	layout: WorkspaceState<unknown> | undefined,
): PagePaneLike | null {
	if (!layout) return null;
	const tab = layout.tabs.find((entry) => entry.id === layout.activeTabId);
	if (!tab?.activePaneId) return null;
	const pane = tab.panes[tab.activePaneId];
	if (!pane || pane.kind !== "page") return null;
	return (pane.data ?? null) as PagePaneLike | null;
}

export function useActivePageSlug(): string | null {
	const matchRoute = useMatchRoute();
	const collections = useCollections();

	const detailMatch = matchRoute({ to: "/pages/$slug" });
	const workspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const workspaceId =
		workspaceMatch === false ? null : workspaceMatch.workspaceId;

	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ localState: collections.v2WorkspaceLocalState })
				.where(({ localState }) =>
					eq(localState.workspaceId, workspaceId ?? ""),
				),
		[collections, workspaceId],
	);

	if (detailMatch !== false) return detailMatch.slug;
	if (!workspaceId) return null;

	const layout = rows.find(
		(row) => row.workspaceId === workspaceId,
	)?.paneLayout;
	return (
		activePagePane(layout as WorkspaceState<unknown> | undefined)?.slug ?? null
	);
}
