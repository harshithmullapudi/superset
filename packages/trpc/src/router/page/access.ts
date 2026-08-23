import type { SelectPage } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";

export function assertPageReadable(page: SelectPage, userId: string): void {
	if (page.visibility === "just_me" && page.createdByUserId !== userId) {
		// NOT_FOUND, not FORBIDDEN: a private page's existence is itself private.
		throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
	}
}

// Creator only: an `org` page is readable org-wide, but a reader must not be able to
// replace a colleague's page at its shared URL. Read is checked first so a `just_me`
// page still answers NOT_FOUND rather than FORBIDDEN.
export function assertPageWritable(page: SelectPage, userId: string): void {
	assertPageReadable(page, userId);
	if (page.createdByUserId !== userId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only the person who created this page can publish new versions",
		});
	}
}
