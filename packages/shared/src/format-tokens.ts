const UNITS = [
	{ limit: 1e12, suffix: "T", digits: 2 },
	{ limit: 1e9, suffix: "B", digits: 1 },
	{ limit: 1e6, suffix: "M", digits: 1 },
	{ limit: 1e3, suffix: "K", digits: 0 },
] as const;

/** "1.24T", "13.9B", "4.2M", "850K", "312" */
export function formatTokens(tokens: number): string {
	for (const [index, unit] of UNITS.entries()) {
		if (tokens < unit.limit) continue;
		// Rounding can carry into the next unit: 999,999 must read 1.0M, not 1000K.
		const carried = Number((tokens / unit.limit).toFixed(unit.digits)) >= 1000;
		const target = (carried ? UNITS[index - 1] : undefined) ?? unit;
		return `${(tokens / target.limit).toFixed(target.digits)}${target.suffix}`;
	}
	return Math.round(tokens).toLocaleString("en-US");
}
