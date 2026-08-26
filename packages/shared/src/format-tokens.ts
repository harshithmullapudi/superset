/** "1.24T", "13.9B", "4.2M", "850K", "312" */
export function formatTokens(tokens: number): string {
	if (tokens >= 1e12) return `${(tokens / 1e12).toFixed(2)}T`;
	if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(1)}B`;
	if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`;
	if (tokens >= 1e3) return `${Math.round(tokens / 1e3)}K`;
	return Math.round(tokens).toLocaleString("en-US");
}
