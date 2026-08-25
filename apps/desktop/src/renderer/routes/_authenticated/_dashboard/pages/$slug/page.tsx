import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { CommentModeButton, PageHeader } from "@superset/ui/page-comments";
import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useState } from "react";
import { Redirect } from "renderer/components/Redirect";
import { PageViewer } from "renderer/routes/_authenticated/_dashboard/components/PageViewer";
import { usePageHeaderData } from "renderer/routes/_authenticated/_dashboard/hooks/usePageHeaderData";

export const Route = createFileRoute("/_authenticated/_dashboard/pages/$slug/")(
	{ component: PageDetailPage },
);

function PageDetailPage() {
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PAGES);
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	return <PageDetailContent />;
}

function PageDetailContent() {
	const { slug } = Route.useParams();
	const navigate = useNavigate();
	const [commentsEnabled, setCommentsEnabled] = useState(false);
	const {
		page,
		versions,
		threads,
		currentUserId,
		onSetVisibility,
		onSetSharedVersion,
		onDelete,
	} = usePageHeaderData({ slug });

	const goBack = () => navigate({ to: "/pages" });

	const backButton = (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			aria-label="Back to pages"
			onClick={goBack}
			className="no-drag size-7 shrink-0 text-muted-foreground"
		>
			<ArrowLeft className="size-4" />
		</Button>
	);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{page ? (
				<PageHeader
					className="drag"
					page={page}
					versions={versions}
					currentUserId={currentUserId}
					leading={backButton}
					trailing={
						<CommentModeButton
							enabled={commentsEnabled}
							openCount={threads.filter((thread) => !thread.resolved).length}
							onToggle={() => setCommentsEnabled(!commentsEnabled)}
						/>
					}
					onSetVisibility={onSetVisibility}
					onSetSharedVersion={onSetSharedVersion}
					onDelete={async () => {
						await onDelete();
						goBack();
					}}
				/>
			) : (
				<div className="drag flex h-11 shrink-0 items-center gap-2 border-b px-2">
					{backButton}
					<Spinner className="size-3.5" />
				</div>
			)}
			<div className="min-h-0 min-w-0 flex-1">
				<PageViewer
					key={slug}
					slug={slug}
					commentsEnabled={commentsEnabled}
					onCommentsEnabledChange={setCommentsEnabled}
				/>
			</div>
		</div>
	);
}
