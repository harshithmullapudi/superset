"use client";

import { Check, RotateCcw } from "lucide-react";
import { cn } from "../../../../../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../../../../ui/avatar";
import { Button } from "../../../../../ui/button";
import type { CommentThread } from "../../../../providers/CommentProvider";
import { relativeTime } from "../../../../utils/relativeTime";
import { initialsOf } from "../../../PageCommentsView/components/CommentPopover";

interface SidebarThreadProps {
	thread: CommentThread;
	active: boolean;
	servedVersion: number | null;
	onSelect: () => void;
	onToggleResolved?: () => void;
}

export function SidebarThread({
	thread,
	active,
	servedVersion,
	onSelect,
	onToggleResolved,
}: SidebarThreadProps) {
	const first = thread.comments[0];
	const rest = thread.comments.length - 1;
	const fromAnotherVersion =
		servedVersion !== null && thread.version !== servedVersion;

	return (
		<div
			className={cn(
				"flex flex-col rounded-lg border-[0.5px] transition-colors",
				active
					? "border-foreground/20 bg-foreground/[0.04]"
					: "border-transparent hover:bg-foreground/[0.03]",
				thread.resolved && "opacity-60",
			)}
		>
			<button
				type="button"
				onClick={onSelect}
				className="flex w-full flex-col gap-1.5 p-2.5 text-left"
			>
				<div className="flex w-full items-center gap-2">
					<Avatar className="size-5">
						{first?.authorImage ? (
							<AvatarImage src={first.authorImage} alt={first.authorName} />
						) : null}
						<AvatarFallback className="text-[9px]">
							{initialsOf(first?.authorName ?? "?")}
						</AvatarFallback>
					</Avatar>
					<span className="truncate text-xs font-medium">
						{first?.authorName ?? "Unknown"}
					</span>
					{first?.authorKind === "agent" ? (
						<span className="rounded bg-foreground/10 px-1 text-[10px] leading-4">
							agent
						</span>
					) : null}
					<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
						{first ? relativeTime(first.createdAt) : ""}
					</span>
				</div>

				{thread.anchor.text ? (
					<span className="w-full truncate text-[11px] text-muted-foreground italic">
						“{thread.anchor.text}”
					</span>
				) : null}

				<p className="line-clamp-3 text-xs whitespace-pre-wrap">
					{first?.body ?? ""}
				</p>
			</button>

			<div className="flex items-center gap-2 px-2.5 pb-2 text-[10px] text-muted-foreground">
				{fromAnotherVersion ? (
					<span className="rounded bg-foreground/[0.06] px-1 leading-4">
						v{thread.version}
					</span>
				) : null}
				{rest > 0 ? (
					<span>
						{rest} more {rest === 1 ? "reply" : "replies"}
					</span>
				) : null}
				{onToggleResolved ? (
					<Button
						size="sm"
						variant="ghost"
						className="ml-auto h-5 gap-1 px-1.5 text-[10px]"
						onClick={onToggleResolved}
					>
						{thread.resolved ? (
							<>
								<RotateCcw className="size-3" />
								Reopen
							</>
						) : (
							<>
								<Check className="size-3" />
								Resolve
							</>
						)}
					</Button>
				) : null}
			</div>
		</div>
	);
}
