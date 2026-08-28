import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import Link from "next/link";
import { FactoryBackdrop } from "@/app/components/FactoryBackdrop";
import { tierRgb } from "@/app/components/TierBadge";
import { initServerI18n } from "@/app/i18n-server";
import {
	RUNS,
	runStatus,
	runStatusLabel,
} from "@/app/the-production-run/constants";
import { fetchStandings, fetchStats } from "@/app/utils/fetchLeaderboard";
import { LeaderboardBoard } from "./components/LeaderboardBoard";

const pixel = Silkscreen({
	weight: ["400", "700"],
	subsets: ["latin"],
	display: "swap",
});

const TITLE = "Leaderboard";
const DESCRIPTION =
	"How much agent work engineers are actually running — tokens, cost, models and sessions, published by people who opted in.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: "/leaderboard" },
	openGraph: {
		title: `${TITLE} | ${COMPANY.NAME}`,
		description: DESCRIPTION,
		url: "/leaderboard",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: `${TITLE} | ${COMPANY.NAME}`,
		description: DESCRIPTION,
		images: ["/opengraph-image"],
	},
};

export const revalidate = 300;

const DEFAULT_PERIOD = "30d" as const;

export default async function LeaderboardPage() {
	initServerI18n();

	const run = RUNS[0];
	const runLabel = run ? runStatusLabel(runStatus(run, new Date()), run) : null;

	const [standings, stats] = await Promise.all([
		fetchStandings({ period: DEFAULT_PERIOD, metric: "tokens", limit: 50 }),
		fetchStats({ period: DEFAULT_PERIOD }),
	]);

	return (
		<main className="relative min-h-screen">
			<FactoryBackdrop />

			<div className="relative max-w-4xl mx-auto px-6 py-10 md:py-14">
				<header className="text-center pt-6 md:pt-10">
					<h1
						className={`${pixel.className} text-3xl md:text-4xl text-foreground`}
					>
						<Trans id="marketing.leaderboard.title">Leaderboard</Trans>
					</h1>
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground mt-5">
						<Trans id="marketing.leaderboard.tagline">
							Agent usage, ranked
						</Trans>
					</p>
					<Link
						href="/stats"
						className="inline-block font-mono text-[0.68rem] uppercase tracking-[0.14em] text-brand hover:text-brand-light transition-colors mt-4"
					>
						<Trans id="marketing.leaderboard.seeAllStats">
							See all stats →
						</Trans>
					</Link>

					<div className="mt-6">
						<style>{`
							.run-callout {
								position: relative;
								border: 1px solid rgba(var(--run-glow), 0.22);
								background: rgba(var(--run-glow), 0.04);
							}
							.run-trail {
								position: absolute;
								inset: 0;
								width: 100%;
								height: 100%;
								pointer-events: none;
								overflow: visible;
							}
							.run-trail rect {
								fill: none;
								stroke: rgb(var(--run-glow));
								stroke-width: 1.5;
								stroke-linecap: round;
								stroke-dasharray: 5 95;
								filter: drop-shadow(0 0 4px rgba(var(--run-glow), 0.9));
								animation: run-trail 4s linear infinite;
							}
							@keyframes run-trail {
								from { stroke-dashoffset: 0; }
								to   { stroke-dashoffset: -100; }
							}
							@media (prefers-reduced-motion: reduce) {
								.run-trail rect { animation: none; stroke-dasharray: none; stroke-opacity: 0.5; }
							}
						`}</style>
						<Link
							href="/the-production-run?run=1"
							style={{ "--run-glow": tierRgb(2) } as React.CSSProperties}
							className="run-callout group inline-flex items-center gap-2 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em]"
						>
							<svg className="run-trail" aria-hidden="true">
								<title>Production run status</title>
								<rect x="0" y="0" width="100%" height="100%" pathLength={100} />
							</svg>
							<span style={{ color: `rgb(${tierRgb(2)})` }}>Run 01</span>
							<span className="text-muted-foreground">
								{runLabel} · everybody to Operator
							</span>
							<span style={{ color: `rgba(${tierRgb(2)},0.8)` }}>→</span>
						</Link>
					</div>
				</header>
				<div className="mt-10 md:mt-12">
					<LeaderboardBoard
						initialStandings={standings}
						initialStats={stats}
						earliest="2025-01-01"
						pixelClassName={pixel.className}
					/>
				</div>
			</div>
		</main>
	);
}
