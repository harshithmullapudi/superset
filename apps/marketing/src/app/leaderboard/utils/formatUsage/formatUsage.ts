export function formatTokens(tokens: number): string {
	if (tokens >= 1e12) return `${(tokens / 1e12).toFixed(2)}T`;
	if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(2)}B`;
	if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`;
	if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}K`;
	return tokens.toLocaleString("en-US");
}

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
	const format = (day: string) =>
		new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		});
	return `${format(range.from)} – ${format(range.to)}`;
}

export function dayCount(range: { from: string; to: string } | null): number {
	if (!range) return 0;
	const from = Date.parse(`${range.from}T00:00:00.000Z`);
	const to = Date.parse(`${range.to}T00:00:00.000Z`);
	if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
	return Math.floor((to - from) / 86_400_000) + 1;
}
