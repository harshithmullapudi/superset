import {
	findFirstPaneId,
	type LayoutNode,
	removePaneFromLayout,
	type Tab,
	type WorkspaceState,
} from "@superset/panes";


export function dropUnavailablePanes<TData>(
	state: WorkspaceState<TData>,
	unavailableKinds: readonly string[],
): WorkspaceState<TData> {
	if (unavailableKinds.length === 0) return state;
	const unavailable = new Set(unavailableKinds);

	const tabs: Tab<TData>[] = [];
	let dropped = false;

	for (const tab of state.tabs) {
		const doomed = Object.values(tab.panes).filter((pane) =>
			unavailable.has(pane.kind),
		);
		if (doomed.length === 0) {
			tabs.push(tab);
			continue;
		}
		dropped = true;

		const panes = { ...tab.panes };
		let layout: LayoutNode | null = tab.layout ?? null;
		for (const pane of doomed) {
			delete panes[pane.id];
			layout = layout ? removePaneFromLayout(layout, pane.id) : null;
		}

		// The tab held nothing else, so it goes with them.
		if (!layout || Object.keys(panes).length === 0) continue;

		tabs.push({
			...tab,
			layout,
			panes,
			activePaneId:
				tab.activePaneId && panes[tab.activePaneId]
					? tab.activePaneId
					: findFirstPaneId(layout),
		});
	}

	if (!dropped) return state;

	return { ...state, tabs, activeTabId: resolveActiveTabId(state, tabs) };
}

// Nearest survivor to the right, then to the left — the direction
// `getActiveIdAfterRemoval` prefers when a single tab closes.
function resolveActiveTabId<TData>(
	state: WorkspaceState<TData>,
	tabs: Tab<TData>[],
): string | null {
	const survivors = new Set(tabs.map((tab) => tab.id));
	if (state.activeTabId && survivors.has(state.activeTabId)) {
		return state.activeTabId;
	}

	const order = state.tabs.map((tab) => tab.id);
	const from = state.activeTabId ? order.indexOf(state.activeTabId) : -1;
	if (from === -1) return tabs[0]?.id ?? null;

	return (
		order.slice(from + 1).find((id) => survivors.has(id)) ??
		order
			.slice(0, from)
			.reverse()
			.find((id) => survivors.has(id)) ??
		null
	);
}
