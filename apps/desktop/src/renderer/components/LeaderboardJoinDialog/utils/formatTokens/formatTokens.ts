export function formatTokens(tokens: number): string {
	if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(1)}B`;
	if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`;
	if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}K`;
	return String(tokens);
}
