import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { FileText } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { usePageFavorites } from "renderer/hooks/usePageFavorites";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useActivePageSlug } from "renderer/routes/_authenticated/_dashboard/hooks/useActivePageSlug";
import {
	isPaneModifier,
	useOpenPage,
} from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPage";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";

interface DashboardSidebarPagesSectionProps {
	isCollapsed?: boolean;
}

export function DashboardSidebarPagesSection({
	isCollapsed = false,
}: DashboardSidebarPagesSectionProps) {
	const isPagesEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PAGES) ?? false;
	const pages = cloudTrpc.page.list.useQuery({}, { enabled: isPagesEnabled });
	const { favoritePageIdSet } = usePageFavorites();
	const openPage = useOpenPage();
	const activeSlug = useActivePageSlug();
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.pages,
	);

	const favorites = useMemo(
		() => (pages.data ?? []).filter((page) => favoritePageIdSet.has(page.id)),
		[pages.data, favoritePageIdSet],
	);

	if (!isPagesEnabled) return null;
	if (favorites.length === 0) return null;

	if (isCollapsed) {
		return (
			<div className="flex flex-col gap-0.5 py-1">
				{favorites.map((page) => (
					<Tooltip key={page.id} delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={(event) =>
									openPage(page, { inPane: isPaneModifier(event) })
								}
								aria-label={page.title}
								aria-current={page.slug === activeSlug ? "page" : undefined}
								className={cn(
									"mx-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
									page.slug === activeSlug
										? "bg-fill-selected text-foreground"
										: "hover:bg-fill-hover",
								)}
							>
								<FileText className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">{page.title}</TooltipContent>
					</Tooltip>
				))}
				<div className="mx-3 mt-1 border-b border-border" />
			</div>
		);
	}

	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader label="Pages" section="pages" />
			{!isSectionCollapsed &&
				favorites.map((page) => {
					const isActive = page.slug === activeSlug;
					return (
						<div
							key={page.id}
							className={cn(
								"relative mx-2 rounded-md text-left text-[13px] transition-colors",
								isActive
									? "bg-fill-selected text-foreground"
									: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
							)}
						>
							<button
								type="button"
								onClick={(event) =>
									openPage(page, { inPane: isPaneModifier(event) })
								}
								aria-current={isActive ? "page" : undefined}
								className="flex h-7 w-full cursor-pointer items-center pr-2 pl-2"
							>
								<span className="mr-2 flex size-4 shrink-0 items-center justify-center">
									<FileText className="size-3.5" />
								</span>
								<span className="min-w-0 flex-1 truncate text-left">
									{page.title}
								</span>
							</button>
						</div>
					);
				})}
		</div>
	);
}
