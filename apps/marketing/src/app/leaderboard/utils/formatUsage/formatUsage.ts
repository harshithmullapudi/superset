import { differenceInCalendarDays, format, parseISO } from "date-fns";

export { formatTokens } from "@superset/shared/format-tokens";

export function formatUsd(usd: string | number): string {
	const value = typeof usd === "string" ? Number.parseFloat(usd) : usd;
	if (!Number.isFinite(value)) return "$0";
	if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
	if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
	return `$${value.toFixed(2)}`;
}

export function formatCount(value: number): string {
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString("en-US");
}

export function formatDayRange(range: { from: string; to: string } | null) {
	if (!range) return "All time";
	return `${format(parseISO(range.from), "MMM d")} – ${format(parseISO(range.to), "MMM d")}`;
}

export function dayCount(range: { from: string; to: string } | null): number {
	if (!range) return 0;
	return differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1;
}
