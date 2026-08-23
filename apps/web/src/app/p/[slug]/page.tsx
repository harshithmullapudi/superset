import { Button } from "@superset/ui/button";
import {
	CommentModeToggle,
	PageCommentsView,
} from "@superset/ui/page-comments";
import { TRPCClientError } from "@trpc/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MessageScreen } from "@/components/MessageScreen";
import { api } from "../../../trpc/server";
import { PageCommentsShell } from "./components/PageCommentsShell";
import { PageVisibilityMenu } from "./components/PageVisibilityMenu";
import { getPagesAccess } from "./utils/getPagesAccess";

interface PageProps {
	params: Promise<{ slug: string }>;
}

const CONTENT_TIMEOUT_MS = 10_000;

function hasCode(error: unknown, code: string): boolean {
	return (
		error instanceof TRPCClientError &&
		(error.data?.code === code || error.shape?.data?.code === code)
	);
}

const isNotFound = (error: unknown) => hasCode(error, "NOT_FOUND");
const isForbidden = (error: unknown) => hasCode(error, "FORBIDDEN");

// Rendered inline rather than thrown: Next strips an error boundary's message in
// production, and the organization's name is the whole point of this screen.
function WrongOrganization({ message }: { message: string }) {
	return (
		<MessageScreen
			title="This page is in another organization"
			description={message}
			action={
				<Button asChild size="sm" variant="outline">
					<Link href="/">Switch organization</Link>
				</Button>
			}
		/>
	);
}

// `api()` caches the client, not the result, so without this the same query runs twice per request.
const getPage = cache(async (slug: string) => {
	const trpc = await api();
	return trpc.page.get.query({ slug });
});

// No OG/Twitter tags on purpose: an unfurler is anonymous, so they would only leak a
// private page's title into link previews. Do not add them without a public visibility tier.
export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const { hasPagesAccess } = await getPagesAccess();
	if (!hasPagesAccess) return { title: "Page" };
	try {
		const page = await getPage(slug);
		return { title: page.title, description: page.description ?? undefined };
	} catch {
		return { title: "Page" };
	}
}

export default async function PublishedPage({ params }: PageProps) {
	const { slug } = await params;

	// Checked before the page is read, so a gated viewer cannot tell a real slug from a made-up one.
	const { hasPagesAccess, session } = await getPagesAccess();
	if (!hasPagesAccess) notFound();

	const trpc = await api();

	let page: Awaited<ReturnType<typeof getPage>>;
	try {
		page = await getPage(slug);
	} catch (error) {
		if (isNotFound(error)) notFound();
		if (isForbidden(error) && error instanceof TRPCClientError) {
			return <WrongOrganization message={error.message} />;
		}
		throw error;
	}

	let content: Awaited<ReturnType<typeof trpc.page.pull.query>>;
	try {
		content = await trpc.page.pull.query({ id: page.id });
	} catch (error) {
		if (isNotFound(error)) notFound();
		throw error;
	}

	// Fetched server-side so the blob URL stays out of the page source.
	let response: Response;
	try {
		response = await fetch(content.downloadUrl, {
			cache: "no-store",
			signal: AbortSignal.timeout(CONTENT_TIMEOUT_MS),
		});
	} catch (error) {
		console.error("[pages] page content fetch failed", {
			slug,
			version: content.version,
			error,
		});
		// Not `notFound()`: the record resolved, so it is the blob read that failed.
		throw new Error("Could not load this page's content", { cause: error });
	}
	if (!response.ok) {
		console.error("[pages] failed to fetch page content", {
			slug,
			version: content.version,
			status: response.status,
		});
		throw new Error(`Could not load this page's content (${response.status})`);
	}
	const html = await response.text();

	return (
		<PageCommentsShell
			pageId={page.id}
			version={content.version}
			user={{
				id: session?.user.id ?? "",
				name: session?.user.name ?? "You",
				image: session?.user.image ?? null,
			}}
		>
			<div className="flex h-dvh flex-col bg-background">
				<header className="flex h-11 shrink-0 items-center gap-x-3 border-b px-3">
					<div className="min-w-0 flex-1">
						<h1 className="truncate font-medium text-sm">{page.title}</h1>
						{page.description ? (
							<p className="truncate text-muted-foreground text-xs">
								{page.description}
							</p>
						) : null}
					</div>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						v{content.version}
					</span>
					<PageVisibilityMenu
						pageId={page.id}
						visibility={page.visibility === "just_me" ? "just_me" : "org"}
						createdByUserId={page.createdByUserId}
					/>
					<CommentModeToggle />
				</header>

				<main className="min-h-0 flex-1">
					<PageCommentsView html={html} title={page.title} />
				</main>
			</div>
		</PageCommentsShell>
	);
}
