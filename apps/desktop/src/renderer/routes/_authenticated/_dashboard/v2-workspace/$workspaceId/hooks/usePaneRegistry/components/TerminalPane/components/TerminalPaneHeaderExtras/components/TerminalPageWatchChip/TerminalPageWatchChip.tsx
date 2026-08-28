import { Plural, Trans } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Eye } from "lucide-react";
import { usePageWatchers } from "renderer/hooks/host-service/usePageWatchers";

interface TerminalPageWatchChipProps {
	workspaceId: string;
	terminalId: string;
}

export function TerminalPageWatchChip({
	workspaceId,
	terminalId,
}: TerminalPageWatchChipProps) {
	const watchers = usePageWatchers(workspaceId);
	const mine = [...watchers.values()].filter(
		(watcher) => watcher.terminalId === terminalId,
	);

	if (mine.length === 0) return null;

	const first = mine[0];
	if (!first) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex h-5 items-center gap-1 rounded px-1 text-muted-foreground/70 text-xs">
					<Eye className="size-3" />
					<span className="max-w-24 truncate">
						{mine.length === 1 ? first.title : mine.length}
					</span>
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{mine.length === 1 ? (
					<Trans id="workspace.terminalPane.watchingOnePage">
						Watching "{first.title}" for new comments
					</Trans>
				) : (
					<div className="flex flex-col gap-0.5">
						<Plural
							id="workspace.terminalPane.watchingPageCount"
							value={mine.length}
							one="Watching # page for new comments"
							other="Watching # pages for new comments"
						/>
						{mine.map((watcher) => (
							<span key={watcher.pageId}>{watcher.title}</span>
						))}
					</div>
				)}
			</TooltipContent>
		</Tooltip>
	);
}
