import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { Building2, FileText, Lock } from "lucide-react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface PagesTabProps {
	workspaceId: string;
	onOpenPage: (page: { id: string; slug: string; title: string }) => void;
	activePageId?: string;
}

// Same vocabulary as the visibility menu, so a page sits under the word that
// published it. `just_me` rows here are always the viewer's own — the list
// query never returns anyone else's.
const GROUPS = [
	{ visibility: "org", label: "Team", icon: Building2 },
	{ visibility: "just_me", label: "Just me", icon: Lock },
] as const;

export function PagesTab({
	workspaceId,
	onOpenPage,
	activePageId,
}: PagesTabProps) {
	const pages = cloudTrpc.page.list.useQuery({ workspaceId });

	if (pages.isPending) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Spinner className="size-4" />
			</div>
		);
	}

	if (pages.error) {
		return (
			<p className="px-3 py-4 text-muted-foreground text-xs">
				{pages.error.message}
			</p>
		);
	}

	if (pages.data.length === 0) {
		return (
			<p className="px-3 py-4 text-muted-foreground text-xs">
				Nothing published from this workspace yet.
			</p>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			{GROUPS.map(({ visibility, label, icon: Icon }) => {
				const group = pages.data.filter(
					(page) => page.visibility === visibility,
				);
				if (group.length === 0) return null;

				return (
					<div key={visibility} className="flex shrink-0 flex-col">
						<div className="flex h-7 shrink-0 items-center gap-1.5 px-3 text-[10px] text-muted-foreground/70 uppercase tracking-wide">
							<Icon className="size-3 shrink-0" />
							<span className="font-medium">{label}</span>
							<span className="tabular-nums">{group.length}</span>
						</div>
						{group.map((page) => (
							<button
								key={page.id}
								type="button"
								onClick={() =>
									onOpenPage({
										id: page.id,
										slug: page.slug,
										title: page.title,
									})
								}
								// Chrome matches the file tree's rows (FILE_EXPLORER_ROW_HEIGHT,
								// pl-3/pr-3, gap-1.5, size-3.5 icon) so the two sidebar tabs read as
								// one list rather than two.
								className={cn(
									"flex h-7 w-full shrink-0 items-center gap-1.5 px-3 text-left text-xs transition-colors",
									page.id === activePageId
										? "bg-accent text-accent-foreground"
										: "hover:bg-accent/50",
								)}
							>
								<FileText className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="min-w-0 flex-1 truncate font-medium">
									{page.title}
								</span>
								<span className="shrink-0 text-[10px] text-muted-foreground">
									{formatDistanceToNowStrict(page.updatedAt, {
										addSuffix: true,
									})}
								</span>
							</button>
						))}
					</div>
				);
			})}
		</div>
	);
}
