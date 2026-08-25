import { Button } from "@superset/ui/button";
import {
	CommentModeButton,
	PageSharePopover,
} from "@superset/ui/page-comments";
import { Share2 } from "lucide-react";
import type { PagePaneData } from "../../../../../../types";
import { usePageHeaderData } from "../../hooks/usePageHeaderData";
import { usePagePaneUi } from "../../hooks/usePagePaneUi";
import { PageHandoffMenu } from "../PageHandoffMenu";

interface PagePaneHeaderExtrasProps {
	data: PagePaneData;
	paneId: string;
	workspaceId: string;
}

export function PagePaneHeaderExtras({
	data,
	paneId,
	workspaceId,
}: PagePaneHeaderExtrasProps) {
	const {
		page,
		versions,
		threads,
		currentUserId,
		onSetVisibility,
		onSetSharedVersion,
	} = usePageHeaderData(data);
	const { commentsEnabled, setCommentsEnabled, shareOpen, setShareOpen } =
		usePagePaneUi(paneId);

	return (
		<>
			<PageHandoffMenu
				workspaceId={workspaceId}
				pageTitle={page?.title ?? data.title ?? data.slug}
				pageSlug={data.slug}
				threads={threads}
			/>
			<CommentModeButton
				compact
				enabled={commentsEnabled}
				openCount={threads.filter((thread) => !thread.resolved).length}
				onToggle={() => setCommentsEnabled(!commentsEnabled)}
			/>
			{page ? (
				<PageSharePopover
					page={page}
					versions={versions}
					editable={
						currentUserId !== undefined &&
						currentUserId === page.createdByUserId
					}
					open={shareOpen}
					onOpenChange={setShareOpen}
					onSetVisibility={onSetVisibility}
					onSetSharedVersion={onSetSharedVersion}
				>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 p-0 text-muted-foreground/60 hover:text-muted-foreground"
						aria-label="Share page"
						title="Share page"
					>
						<Share2 className="size-3.5" />
					</Button>
				</PageSharePopover>
			) : null}
		</>
	);
}
