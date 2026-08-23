import type { CliContext } from "../../../lib/command";
import { pageRefFromArg } from "../pageRef";

// `pageComment.list` keys off a uuid, but `--page` takes whatever `pages list`
// printed, so a slug costs one extra round trip.
export async function resolvePageId(
	ctx: CliContext,
	ref: string,
): Promise<string> {
	const pageRef = pageRefFromArg(ref);
	if ("id" in pageRef) return pageRef.id;
	const page = await ctx.api.page.get.query(pageRef);
	return page.id;
}
