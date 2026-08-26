"use client";

import { useEffect, useState } from "react";
import type {
	LeaderboardMetric,
	LeaderboardStats,
	Standings,
} from "../../utils/fetchLeaderboard";
import {
	formatDayRange,
	formatTokens,
	formatUsd,
} from "../../utils/formatUsage";
import { LeaderboardTable } from "../LeaderboardTable";
import { MetricTabs } from "../MetricTabs";
import { type RangeSelection, RangeTabs } from "../RangeTabs";
import { StatStrip } from "../StatStrip";
import { TierTube } from "../TierTube";
import { buildStandingsQuery } from "./utils/buildStandingsQuery";

interface LeaderboardBoardProps {
	apiUrl: string;
	initialStandings: Standings | null;
	initialStats: LeaderboardStats | null;
	earliest: string;

	pixelClassName?: string;
}

const PAGE_SIZE = 50;

export function LeaderboardBoard({
	apiUrl,
	initialStandings,
	initialStats,
	earliest,
	pixelClassName,
}: LeaderboardBoardProps) {
	const [metric, setMetric] = useState<LeaderboardMetric>("tokens");
	const [selection, setSelection] = useState<RangeSelection>({ period: "30d" });
	const [standings, setStandings] = useState(initialStandings);
	const [stats, setStats] = useState(initialStats);
	const [loading, setLoading] = useState(false);
	const [touched, setTouched] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);

	useEffect(() => {
		if (!touched) return;

		const controller = new AbortController();
		setLoading(true);

		Promise.all([
			fetch(
				`${apiUrl}/api/leaderboard?${buildStandingsQuery(selection, metric)}&limit=50`,
				{
					signal: controller.signal,
				},
			).then((response) => (response.ok ? response.json() : null)),
			fetch(
				`${apiUrl}/api/leaderboard/stats?${buildStandingsQuery(selection)}`,
				{
					signal: controller.signal,
				},
			).then((response) => (response.ok ? response.json() : null)),
		])
			.then(([nextStandings, nextStats]) => {
				if (nextStandings) setStandings(nextStandings);
				if (nextStats) setStats(nextStats);
			})
			.catch(() => {})
			.finally(() => setLoading(false));

		return () => controller.abort();
	}, [apiUrl, metric, selection, touched]);

	const loadMore = async () => {
		if (!standings || loadingMore) return;
		setLoadingMore(true);
		try {
			const response = await fetch(
				`${apiUrl}/api/leaderboard?${buildStandingsQuery(selection, metric)}&limit=${PAGE_SIZE}&offset=${standings.rows.length}`,
			);
			if (!response.ok) return;
			const next: Standings = await response.json();
			setStandings({
				...next,
				rows: [...standings.rows, ...next.rows],
			});
		} catch {
		} finally {
			setLoadingMore(false);
		}
	};

	const update = (
		next: Partial<{ metric: LeaderboardMetric; selection: RangeSelection }>,
	) => {
		setTouched(true);
		if (next.metric) setMetric(next.metric);
		if (next.selection) setSelection(next.selection);
	};

	const range = standings?.range ?? null;
	const totals = stats?.totals;

	return (
		<div className="space-y-8">
			<TierTube
				subject="fleet"
				position={stats?.tiers?.position ?? 0}
				counts={stats?.tiers?.distribution}
				pixelClassName={pixelClassName}
			/>

			{totals && (
				<StatStrip
					pixelClassName={pixelClassName}
					stats={[
						{ label: "Developers", value: String(totals.participants) },
						{ label: "Tokens", value: formatTokens(totals.tokens) },
						{
							label: "Cost",
							value: formatUsd(totals.usd),
							hint: "API-equivalent",
						},
						{
							label: "Cache read",
							value: `${
								totals.tokens > 0
									? Math.round(
											((stats?.tokenSplit.cachedInput ?? 0) / totals.tokens) *
												100,
										)
									: 0
							}%`,
							hint: "of all tokens",
						},
					]}
				/>
			)}

			<div className="flex flex-col items-center gap-4">
				<MetricTabs
					value={metric}
					onChange={(next) => update({ metric: next })}
				/>
				<RangeTabs
					value={selection}
					onChange={(next) => update({ selection: next })}
					earliest={new Date(`${earliest}T00:00:00`)}
					latest={new Date()}
				/>
				<span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground/70">
					{formatDayRange(range)}
				</span>
			</div>

			<LeaderboardTable
				rows={standings?.rows ?? []}
				metric={metric}
				isLoading={loading && !standings}
				pixelClassName={pixelClassName}
			/>

			{standings && standings.total > standings.rows.length && (
				<div className="flex flex-col items-center gap-3">
					<button
						type="button"
						onClick={loadMore}
						disabled={loadingMore}
						className="px-5 py-2 text-xs font-mono uppercase tracking-wider border border-border rounded-[2px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
					>
						{loadingMore ? "Loading…" : "Load more"}
					</button>
					<span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground/70">
						{standings.rows.length} of {standings.total}
					</span>
				</div>
			)}
		</div>
	);
}
