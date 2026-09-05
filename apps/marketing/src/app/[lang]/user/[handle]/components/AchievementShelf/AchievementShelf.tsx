import { Trans } from "@lingui/react/macro";
import { CATALOG_BY_SLUG } from "@superset/trpc/leaderboard-achievements";
import { AchievementMedal } from "@/app/[lang]/components/AchievementMedal";
import { MilestoneChip } from "@/app/[lang]/components/MilestoneChip";

interface Award {
	slug: string;
	tier: number;
	awardedOn: string;
}

interface AchievementShelfProps {
	awards: readonly Award[];
}

function highestPerSlug(awards: readonly Award[]): Award[] {
	const best = new Map<string, Award>();

	for (const award of awards) {
		const held = best.get(award.slug);
		if (!held) {
			best.set(award.slug, award);
			continue;
		}
		best.set(award.slug, {
			slug: award.slug,
			tier: Math.max(held.tier, award.tier),
			awardedOn:
				held.awardedOn < award.awardedOn ? held.awardedOn : award.awardedOn,
		});
	}

	return [...best.values()];
}

export function AchievementShelf({ awards }: AchievementShelfProps) {
	const held = highestPerSlug(awards);
	const badges = held.filter(
		(award) => CATALOG_BY_SLUG[award.slug]?.kind === "badge",
	);
	const milestones = held.filter(
		(award) => CATALOG_BY_SLUG[award.slug]?.kind === "milestone",
	);

	if (badges.length === 0 && milestones.length === 0) return null;

	return (
		<section>
			<h2 className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground mb-3">
				<Trans>Achievements</Trans>
			</h2>

			{badges.length > 0 && (
				<div className="flex flex-wrap gap-2.5">
					{badges.map((award) => (
						<AchievementMedal
							key={award.slug}
							slug={award.slug}
							tier={award.tier}
							awardedOn={award.awardedOn}
						/>
					))}
				</div>
			)}

			{milestones.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mt-4">
					{milestones.map((award) => (
						<MilestoneChip
							key={award.slug}
							slug={award.slug}
							tier={award.tier}
						/>
					))}
				</div>
			)}
		</section>
	);
}
