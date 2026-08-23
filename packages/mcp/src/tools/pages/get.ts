import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { pageRef } from "./pageRef";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_get",
		annotations: { readOnlyHint: true },
		description:
			"Show one published page's metadata: title, description, visibility, public URL, and which version is currently served. Does NOT return the page's HTML — use pages_pull for that. Address the page by id or by slug; exactly one is required.",
		inputSchema: {
			id: z.string().uuid().nullish().describe("Page UUID."),
			slug: z
				.string()
				.min(1)
				.max(120)
				.nullish()
				.describe("Page slug, the last path segment of its public URL."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.page.get(pageRef(input));
		},
	});
}
