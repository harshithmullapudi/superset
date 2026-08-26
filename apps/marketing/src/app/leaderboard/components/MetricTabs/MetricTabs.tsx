"use client";

import type { LeaderboardMetric } from "../../utils/fetchLeaderboard";

const METRICS: Array<{ id: LeaderboardMetric; label: string }> = [
	{ id: "tokens", label: "Tokens" },
	{ id: "cost", label: "Cost" },
];

interface MetricTabsProps {
	value: LeaderboardMetric;
	onChange: (metric: LeaderboardMetric) => void;
}

export function MetricTabs({ value, onChange }: MetricTabsProps) {
	return (
		<div
			className="inline-flex border border-border rounded-[2px] overflow-hidden"
			role="tablist"
			aria-label="Rank by"
		>
			{METRICS.map((metric) => {
				const active = metric.id === value;
				return (
					<button
						key={metric.id}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(metric.id)}
						className={`px-5 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
							active
								? "bg-brand/10 text-brand"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{metric.label}
					</button>
				);
			})}
		</div>
	);
}
