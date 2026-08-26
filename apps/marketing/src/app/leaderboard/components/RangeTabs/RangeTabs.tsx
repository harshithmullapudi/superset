"use client";

import { Button } from "@superset/ui/button";
import { Calendar } from "@superset/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import type { LeaderboardPeriod } from "../../utils/fetchLeaderboard";
import { formatRangeLabel } from "./utils/formatRangeLabel";

const PRESETS: Array<{ id: LeaderboardPeriod; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "7d", label: "7D" },
	{ id: "30d", label: "30D" },
];

export interface RangeSelection {
	period: LeaderboardPeriod;
	custom?: DateRange;
}

interface RangeTabsProps {
	value: RangeSelection;
	onChange: (selection: RangeSelection) => void;
	earliest: Date;
	latest: Date;
}

export function RangeTabs({
	value,
	onChange,
	earliest,
	latest,
}: RangeTabsProps) {
	const customActive = Boolean(value.custom?.from && value.custom?.to);

	return (
		<div className="flex flex-wrap items-center gap-2">
			{PRESETS.map((preset) => {
				const active = !customActive && value.period === preset.id;
				return (
					<button
						key={preset.id}
						type="button"
						onClick={() => onChange({ period: preset.id })}
						className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider border rounded-[2px] transition-colors ${
							active
								? "border-brand text-brand bg-brand/5"
								: "border-border text-muted-foreground hover:text-foreground"
						}`}
					>
						{preset.label}
					</button>
				);
			})}

			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className={`gap-2 font-mono text-xs uppercase tracking-wider rounded-[2px] ${
							customActive ? "border-brand text-brand" : ""
						}`}
					>
						<CalendarIcon className="size-3.5" />
						{formatRangeLabel(value.custom)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-3" align="start">
					<Calendar
						mode="range"
						numberOfMonths={2}
						defaultMonth={
							value.custom?.from ??
							new Date(latest.getFullYear(), latest.getMonth() - 1, 1)
						}
						selected={value.custom}
						onSelect={(range) =>
							onChange({
								period: value.period,
								custom: range?.from && range?.to ? range : range,
							})
						}
						disabled={{ before: earliest, after: latest }}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
