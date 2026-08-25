import { formatDistanceToNowStrict } from "date-fns";

export function relativeTime(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return formatDistanceToNowStrict(date, { addSuffix: true });
}
