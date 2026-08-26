import type { DateRange } from "react-day-picker";

export function formatRangeLabel(range: DateRange | undefined): string {
	if (!range?.from) return "Custom";
	const format = (date: Date) =>
		date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	return range.to
		? `${format(range.from)} – ${format(range.to)}`
		: format(range.from);
}
