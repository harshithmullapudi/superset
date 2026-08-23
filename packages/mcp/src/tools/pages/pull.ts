import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_pull",
		annotations: { readOnlyHint: true },
		description:
			"Get a download URL for a published page's HTML, plus that version's metadata. Fetch the returned `downloadUrl` to read the bytes — this tool does not return the document itself. The URL is unguessable but not access-gated, so treat it as a secret. Use this when you need to see what a page currently says before editing the source it was published from.",
		inputSchema: {
			id: z.string().uuid().describe("Page UUID. Find it with pages_list."),
			version: z
				.number()
				.int()
				.positive()
				.nullish()
				.describe(
					"A specific version number. Omit for whichever version is currently served.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.page.pull({
				id: input.id,
				...(input.version ? { version: input.version } : {}),
			});
		},
	});
}
