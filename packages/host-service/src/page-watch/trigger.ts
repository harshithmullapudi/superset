import type { PageWatchEntry, WatchedThread } from "./types.ts";

export const MAX_PINGS_PER_THREAD = 5;

export interface TriggerResult {
	fired: WatchedThread[];
	cursor: number;
	pings: Map<string, number>;
	suppressed: string[];
}

function newestHumanComment(thread: WatchedThread): number {
	let newest = 0;
	for (const comment of thread.comments) {
		if (comment.authorKind !== "human") continue;
		const at = comment.createdAt.getTime();
		if (at > newest) newest = at;
	}
	return newest;
}

export function selectThreadsToDeliver(
	threads: WatchedThread[],
	entry: Pick<PageWatchEntry, "cursor" | "pings">,
): TriggerResult {
	const pings = new Map(entry.pings);
	const fired: WatchedThread[] = [];
	const suppressed: string[] = [];
	let cursor = entry.cursor;

	for (const thread of threads) {
		if (thread.resolved) continue;

		const newest = newestHumanComment(thread);
		if (newest <= entry.cursor) continue;

		if (newest > cursor) cursor = newest;

		const seen = pings.get(thread.id) ?? 0;
		if (seen >= MAX_PINGS_PER_THREAD) {
			suppressed.push(thread.id);
			continue;
		}

		pings.set(thread.id, seen + 1);
		fired.push(thread);
	}

	return { fired, cursor, pings, suppressed };
}
