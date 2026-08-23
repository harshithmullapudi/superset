"use client";

import { MessageSquarePlus } from "lucide-react";
import { Toggle } from "../../../ui/toggle";
import { useComments } from "../../providers/CommentProvider";

// `Toggle` rather than a Button: a primary fill would read as a call to action instead of a mode.
export function CommentModeToggle() {
	const { enabled, toggleEnabled, threads } = useComments();
	const open = threads.filter((thread) => !thread.resolved).length;
	const label = enabled ? "Leave comment mode" : "Comment on this page";

	return (
		<Toggle
			size="sm"
			pressed={enabled}
			onPressedChange={toggleEnabled}
			aria-label={label}
			title={label}
			className="gap-1.5"
		>
			<MessageSquarePlus className="size-4" />
			{/* Inline rather than a corner badge: the toggle sits flush against the
			    pane edge, where an overflowing dot gets clipped. */}
			{open > 0 ? (
				<span className="font-medium text-xs tabular-nums">{open}</span>
			) : null}
		</Toggle>
	);
}
