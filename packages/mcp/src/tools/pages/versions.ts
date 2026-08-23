import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { pageRef } from "./pageRef";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_versions",
		annotations: { readOnlyHint: true },
		description:
			"List a page's version history, newest first, with each version's label, size, and who published it. Every publish creates a new version; nothing is overwritten. Address the page by id or slug; exactly one is required.",
		inputSchema: {
			id: z.string().uuid().nullish().describe("Page UUID."),
			slug: z.string().min(1).max(120).nullish().describe("Page slug."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.page.versions(pageRef(input));
		},
	});
}
