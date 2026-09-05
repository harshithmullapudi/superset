import { Trans, useLingui } from "@lingui/react/macro";
import {
	type AxisGap,
	type AxisName,
	type AxisValues,
	type Tier,
	tierGap,
} from "@superset/trpc/leaderboard-tier";
import { MeterBar } from "@/app/[lang]/components/MeterBar";
import { tierLabel, tierRgb } from "@/app/[lang]/components/TierBadge";
import {
	formatCount,
	formatTokens,
	formatUsd,
} from "@/app/[lang]/utils/formatUsage";
import { AXIS_HINTS, AXIS_LABELS, AXIS_UNITS } from "./constants";

function axisValue(axis: AxisName, value: number): string {
	if (value <= 0 && axis === "cost") return "—";
	if (axis === "depth") return formatTokens(value);
	if (axis === "cost") return formatUsd(value);
	if (axis === "width") return value.toFixed(1);
	if (axis === "output") return String(Math.round(value));
	return formatCount(value);
}

function fill(gap: AxisGap): number {
	if (gap.needed <= 0) return 1;
	if (gap.lowerIsBetter) {
		if (gap.current <= 0) return 0;
		return Math.min(1, gap.needed / gap.current);
	}
	return Math.min(1, gap.current / gap.needed);
}

interface TierGateProps {
	tier: number;
	axes: AxisValues;
}

export function TierGate({ tier, axes }: TierGateProps) {
	const { t } = useLingui();
	const gaps = tierGap(axes, tier as Tier);
	const atTop = tier >= 4;
	const nextLabel = t(tierLabel(Math.min(4, tier + 1)));
	const met = gaps.filter((gap) => gap.met).length;

	const cleared = `rgb(${tierRgb(3)})`;
	const blocking = `rgb(${tierRgb(4)})`;

	return (
		<div>
			<div className="flex items-baseline justify-between gap-4">
				<span className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-foreground">
					{atTop ? <Trans>Henry Ford</Trans> : <Trans>Next: {nextLabel}</Trans>}
				</span>
				{!atTop && (
					<span
						className="font-mono text-[0.62rem] uppercase tracking-[0.1em] shrink-0"
						style={{ color: met === gaps.length ? cleared : blocking }}
					>
						<Trans>
							{String(met)}/{String(gaps.length)}
						</Trans>
					</span>
				)}
			</div>

			<p className="text-[0.68rem] text-muted-foreground mt-2 leading-relaxed">
				{atTop ? (
					<Trans>Top tier. Nothing left to clear.</Trans>
				) : met === gaps.length ? (
					<Trans>
						Every axis is carrying its weight for the next tier. Hold it and the
						tier follows.
					</Trans>
				) : (
					<Trans>
						Your tier is a weighted score across all five axes, so a strong axis
						offsets a weak one. The axes below are the ones lagging.
					</Trans>
				)}
			</p>

			<div className="mt-4 space-y-2.5">
				{gaps.map((gap) => {
					const accent = gap.met ? cleared : blocking;
					return (
						<div key={gap.axis}>
							<div className="flex items-baseline justify-between gap-3 font-mono text-[0.62rem]">
								<span
									className="uppercase tracking-[0.1em] text-muted-foreground"
									title={t(AXIS_HINTS[gap.axis])}
								>
									{t(AXIS_LABELS[gap.axis])}
								</span>
								<span className="flex items-baseline gap-1.5 tabular-nums shrink-0">
									<span
										className={
											gap.met ? "text-muted-foreground" : "text-foreground"
										}
									>
										{axisValue(gap.axis, gap.current)}
									</span>
									<span className="text-muted-foreground/40">
										{gap.lowerIsBetter ? "≤" : "/"}
									</span>
									<span className="text-muted-foreground/70">
										{axisValue(gap.axis, gap.needed)}
									</span>
									<span className="text-muted-foreground/40 normal-case">
										{t(AXIS_UNITS[gap.axis])}
									</span>
								</span>
							</div>
							<MeterBar
								className="mt-1.5"
								value={fill(gap)}
								color={accent}
								muted={gap.met}
							/>
						</div>
					);
				})}
			</div>

			<p className="font-mono text-[0.56rem] uppercase tracking-[0.1em] text-muted-foreground/60 border-t border-border pt-2.5 mt-4">
				<Trans>Axes are medians over the trailing 30 days</Trans>
			</p>
		</div>
	);
}
