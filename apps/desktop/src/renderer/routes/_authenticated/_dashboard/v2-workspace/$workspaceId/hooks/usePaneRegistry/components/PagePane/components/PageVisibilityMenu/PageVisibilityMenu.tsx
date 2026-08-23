import { authClient } from "@superset/auth/client";
import {
	type PageVisibility,
	PageVisibilityMenu as VisibilityMenu,
} from "@superset/ui/page-comments";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface PageVisibilityMenuProps {
	pageId: string;
	visibility: PageVisibility;
	createdByUserId: string | null;
}

// Desktop wiring for the shared menu; only the client and the re-read differ from web.
export function PageVisibilityMenu({
	pageId,
	visibility,
	createdByUserId,
}: PageVisibilityMenuProps) {
	const { data: session } = authClient.useSession();
	const utils = cloudTrpc.useUtils();
	const setVisibility = cloudTrpc.page.setVisibility.useMutation();

	return (
		<VisibilityMenu
			visibility={visibility}
			createdByUserId={createdByUserId}
			currentUserId={session?.user?.id}
			onChange={async (next) => {
				await setVisibility.mutateAsync({ id: pageId, visibility: next });
				// `pull` feeds this pane's label and `list` the sidebar's lock icon; both are awaited so the menu stays busy until each catches up.
				await Promise.all([
					utils.page.pull.invalidate({ id: pageId }),
					utils.page.list.invalidate(),
				]);
			}}
		/>
	);
}
