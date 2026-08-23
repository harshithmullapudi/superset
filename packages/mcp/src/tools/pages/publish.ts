import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_publish",
		annotations: { destructiveHint: false },
		description:
			"Publish an HTML document as a page and return its public URL. A page is ONE self-contained file: inline every stylesheet and script, and embed images as data: URIs — external references will not resolve. Every call creates a new version; pass `pageId` to add a version to an existing page instead of creating a new one. Pass the document itself in `html`, not a file path.",
		inputSchema: {
			html: z
				.string()
				.min(1)
				.describe(
					"The complete HTML document, as text. Must be self-contained.",
				),
			filename: z
				.string()
				.min(1)
				.max(255)
				.nullish()
				.describe(
					"Filename recorded for this version, e.g. `report.html`. Defaults to `page.html`.",
				),
			pageId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Publish a new version of this existing page. Omit to create a new page.",
				),
			title: z
				.string()
				.min(1)
				.max(200)
				.nullish()
				.describe("Page title. Defaults to the filename."),
			description: z
				.string()
				.max(2000)
				.nullish()
				.describe("Short description shown alongside the page."),
			label: z
				.string()
				.max(200)
				.nullish()
				.describe(
					"What changed in this version, shown in the version history. Display-only.",
				),
			visibility: z
				.enum(["just_me", "org"])
				.nullish()
				.describe(
					"`org` lets anyone in the organization open it; `just_me` keeps it private to the publisher.",
				),
			workspaceId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Link the page to this workspace so it shows in that workspace's Pages tab. Requires `entryPath`.",
				),
			entryPath: z
				.string()
				.min(1)
				.max(1024)
				.nullish()
				.describe(
					"Path of the source file relative to the workspace root. Requires `workspaceId`; together they are the key a later publish reuses to add a version rather than a new page.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			// Base64 at this edge rather than in the tool schema: an agent holds the
			// document as text, and making it encode first is a step it can get wrong.
			const content = Buffer.from(input.html, "utf8").toString("base64");
			// Passed through even when only one side is set, so the router rejects a
			// half-link instead of quietly publishing a page no workspace owns.
			const link = {
				...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
				...(input.entryPath ? { entryPath: input.entryPath } : {}),
			};

			return caller.page.publish({
				content,
				contentType: "text/html",
				filename: input.filename ?? "page.html",
				...link,
				...(input.pageId ? { pageId: input.pageId } : {}),
				...(input.title ? { title: input.title } : {}),
				...(input.description ? { description: input.description } : {}),
				...(input.label ? { label: input.label } : {}),
				...(input.visibility ? { visibility: input.visibility } : {}),
			});
		},
	});
}
