import type { LeaderboardMetric } from "../../../../utils/fetchLeaderboard";
import type { RangeSelection } from "../../../RangeTabs";

function toDayKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildStandingsQuery(
	selection: RangeSelection,
	metric?: LeaderboardMetric,
): string {
	const params = new URLSearchParams();
	const custom = selection.custom;
	if (custom?.from && custom?.to) {
		params.set("from", toDayKey(custom.from));
		params.set("to", toDayKey(custom.to));
	} else {
		params.set("period", selection.period);
	}
	if (metric) params.set("metric", metric);
	return params.toString();
}
