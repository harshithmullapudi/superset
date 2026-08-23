import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { CommentThread } from "@superset/ui/page-comments";
import { useComments, useFramePointerDown } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { formatDistanceToNowStrict } from "date-fns";
import { Bot, ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";

interface PageHandoffMenuProps {
	workspaceId: string;
	pageTitle: string;
	/** Identifies the page unambiguously, unlike the title, which is free text. */
	pageSlug: string;
}

// Desktop-only: the web viewer has no agents to hand off to.
export function PageHandoffMenu({
	workspaceId,
	pageTitle,
	pageSlug,
}: PageHandoffMenuProps) {
	const { threads } = useComments();
	const bindings = useTerminalAgentBindings(workspaceId);
	const send = workspaceTrpc.terminal.send.useMutation();
	const [menuOpen, setMenuOpen] = useState(false);

	// Radix only dismisses on an outside press this document sees, which a press in the iframe is not.
	useFramePointerDown(useCallback(() => setMenuOpen(false), []));

	const open = threads.filter((thread) => !thread.resolved);
	// Nothing to hand off, nothing to show.
	if (open.length === 0) return null;

	// Live sessions only: a binding with `endedAt` cannot receive a prompt.
	const running = [...bindings.values()]
		.filter((binding) => !binding.endedAt)
		.sort((a, b) => b.lastEventAt - a.lastEventAt);

	const handoff = (terminalId: string) => {
		send.mutate(
			{
				workspaceId,
				terminalId,
				text: buildPrompt(pageTitle, pageSlug, open),
				submit: true,
			},
			{
				onSuccess: () => toast.success("Sent to agent"),
				onError: (error) =>
					toast.error("Could not reach that agent", {
						description: error.message,
					}),
			},
		);
	};

	return (
		<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
			<DropdownMenuTrigger asChild>
				<Button size="xs" variant="ghost" disabled={send.isPending}>
					<Bot className="size-3.5" />
					Hand off
					<ChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
					{open.length} open {open.length === 1 ? "comment" : "comments"}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{running.length === 0 ? (
					<DropdownMenuItem disabled>No agents running here</DropdownMenuItem>
				) : (
					running.map((binding) => (
						<DropdownMenuItem
							key={binding.terminalId}
							onSelect={() => handoff(binding.terminalId)}
							className="gap-2"
						>
							<Bot className="size-4 text-muted-foreground" />
							<div className="flex min-w-0 flex-col">
								<span className="truncate text-sm">
									{binding.definitionId ?? binding.agentId}
								</span>
								<span className="text-muted-foreground text-xs">
									active{" "}
									{formatDistanceToNowStrict(binding.lastEventAt, {
										addSuffix: true,
									})}
								</span>
							</div>
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// A multi-line body would otherwise spill out of the list and read as instructions to the agent.
function indent(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line, index) => (index === 0 ? line : `${prefix}${line}`))
		.join("\n");
}

// The anchor path goes to the agent too: a page is one self-contained .html file, so the
// published DOM is the source it edits, and repeated text alone locates nothing.
function buildPrompt(
	pageTitle: string,
	pageSlug: string,
	threads: CommentThread[],
): string {
	const lines = [
		`There are ${threads.length} unresolved comment${threads.length === 1 ? "" : "s"} on the published page "${pageTitle}" (slug: ${pageSlug}). Address each one in the source this page was published from.`,
		"",
		"Each comment is anchored to one element. `at` is a CSS selector path from <body> in the published HTML, and `text` is what that element contained when the comment was written (truncated).",
		"",
	];
	threads.forEach((thread, index) => {
		const { path, tag, text } = thread.anchor;
		lines.push(`${index + 1}. <${tag}> at: ${path || "body"}`);
		// JSON-quoted so the page's own copy cannot break the line structure the agent reads.
		if (text) lines.push(`   text: ${JSON.stringify(text)}`);
		for (const comment of thread.comments) {
			lines.push(`   ${comment.authorName}: ${indent(comment.body, "   ")}`);
		}
		lines.push("");
	});
	return lines.join("\n");
}
