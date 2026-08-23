import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolvePageId } from "../pageId";

interface ThreadComment {
	authorName: string;
	authorKind: string;
	body: string;
	createdAt: string | Date;
}

interface Thread {
	id: string;
	anchor: { path: string; tag: string } | null;
	anchorText: string | null;
	resolved: boolean;
	comments: ThreadComment[];
}

export default command({
	description: "List comment threads on a page, oldest first",
	options: {
		page: string().alias("pageId").required().desc("Page id or slug"),
		threadId: string().alias("thread").desc("Show only this thread"),
	},
	run: async ({ ctx, options }) => {
		const pageId = await resolvePageId(ctx, options.page);
		const threads = (await ctx.api.pageComment.list.query({
			pageId,
		})) as unknown as Thread[];

		if (!options.threadId) return threads;

		const match = threads.filter((thread) => thread.id === options.threadId);
		if (match.length === 0) {
			throw new CLIError(
				`No thread ${options.threadId} on this page`,
				"Run without --threadId to see every thread on the page",
			);
		}
		return match;
	},
	// A transcript rather than a table: the bodies are the point, and they do not
	// fit a column. `--json` still gives the full shape.
	display: (data) => {
		const threads = data as Thread[];
		if (threads.length === 0) return "No comments on this page.";

		return threads
			.map((thread) => {
				const where = thread.anchor
					? `<${thread.anchor.tag}> ${thread.anchor.path || "body"}`
					: "whole page";
				const lines = [
					`${thread.id}  ${thread.resolved ? "resolved" : "open"}  ${where}`,
				];
				if (thread.anchorText) {
					lines.push(`  text: ${JSON.stringify(thread.anchorText)}`);
				}
				for (const comment of thread.comments) {
					const who =
						comment.authorKind === "agent"
							? `${comment.authorName} (agent)`
							: comment.authorName;
					lines.push(`  ${who}: ${indent(comment.body, "    ")}`);
				}
				return lines.join("\n");
			})
			.join("\n\n");
	},
});

// Keeps a multi-line body inside its own thread block.
function indent(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line, index) => (index === 0 ? line : `${prefix}${line}`))
		.join("\n");
}
