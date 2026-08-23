import { db } from "@superset/db/client";
import {
	pages,
	pageVersions,
	type SelectPage,
	workspacePages,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { head } from "@vercel/blob";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { assertPageReadable, assertPageWritable } from "./access";
import { pageUrl } from "./page-url";
import { publishPage } from "./publish";
import {
	listPagesSchema,
	pageRefSchema,
	publishPageSchema,
	pullPageSchema,
	setPageVisibilitySchema,
} from "./schema";
import { assertWorkspaceAccess } from "./workspace-access";

function visibilityFilter(userId: string) {
	return or(
		eq(pages.visibility, "org"),
		and(eq(pages.visibility, "just_me"), eq(pages.createdByUserId, userId)),
	);
}

async function loadPage({
	id,
	slug,
	organizationId,
	userId,
}: {
	id?: string;
	slug?: string;
	organizationId: string;
	userId: string;
}): Promise<SelectPage> {
	const identity = id ? eq(pages.id, id) : slug ? eq(pages.slug, slug) : null;
	if (!identity) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Provide either id or slug",
		});
	}

	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.organizationId, organizationId), identity))
		.limit(1);

	if (!page) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
	}
	assertPageReadable(page, userId);
	return page;
}

async function latestVersionNumber(pageId: string): Promise<number | null> {
	const [row] = await db
		.select({ version: pageVersions.version })
		.from(pageVersions)
		.where(eq(pageVersions.pageId, pageId))
		.orderBy(desc(pageVersions.version))
		.limit(1);
	return row?.version ?? null;
}

export const pageRouter = {
	// Every publish is a new version; there is no dedup.
	publish: protectedProcedure
		.input(publishPageSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return await publishPage({
				input,
				organizationId,
				userId: ctx.session.user.id,
			});
		}),

	list: protectedProcedure
		.input(listPagesSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			// Same gate as publish: a caller-supplied workspaceId must not probe another tenant.
			if (input?.workspaceId) {
				await assertWorkspaceAccess({
					executor: db,
					workspaceId: input.workspaceId,
					organizationId,
				});
			}

			// A LATERAL runs once per in-scope page and stops at the first row; DISTINCT ON sorted every tenant's versions.
			const latest = db
				.select({
					version: pageVersions.version,
					contentType: pageVersions.contentType,
					sizeBytes: pageVersions.sizeBytes,
					publishedAt: pageVersions.createdAt,
				})
				.from(pageVersions)
				.where(eq(pageVersions.pageId, pages.id))
				.orderBy(desc(pageVersions.version))
				.limit(1)
				.as("latest");

			const base = db
				.select({
					id: pages.id,
					slug: pages.slug,
					title: pages.title,
					description: pages.description,
					visibility: pages.visibility,
					sharedVersion: pages.sharedVersion,
					createdAt: pages.createdAt,
					updatedAt: pages.updatedAt,
					latestVersion: latest.version,
					contentType: latest.contentType,
					sizeBytes: latest.sizeBytes,
					publishedAt: latest.publishedAt,
				})
				.from(pages)
				.leftJoinLateral(latest, sql`true`);

			const scoped = input?.workspaceId
				? base
						.innerJoin(workspacePages, eq(workspacePages.pageId, pages.id))
						.where(
							and(
								eq(pages.organizationId, organizationId),
								eq(workspacePages.workspaceId, input.workspaceId),
								visibilityFilter(userId),
							),
						)
				: base.where(
						and(
							eq(pages.organizationId, organizationId),
							visibilityFilter(userId),
						),
					);

			const rows = await scoped.orderBy(desc(pages.updatedAt));
			return rows.map((row) => ({ ...row, url: pageUrl(row.slug) }));
		}),

	get: protectedProcedure.input(pageRefSchema).query(async ({ ctx, input }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const page = await loadPage({
			id: input.id,
			slug: input.slug,
			organizationId,
			userId: ctx.session.user.id,
		});

		const latestVersion = await latestVersionNumber(page.id);
		return {
			...page,
			url: pageUrl(page.slug),
			latestVersion,
			servedVersion: page.sharedVersion ?? latestVersion,
		};
	}),

	// Creator only, same as publishing: changing who sees a page can expose a colleague's work.
	setVisibility: protectedProcedure
		.input(setPageVisibilitySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await loadPage({ id: input.id, organizationId, userId });
			assertPageWritable(page, userId);

			const [updated] = await db
				.update(pages)
				.set({ visibility: input.visibility })
				.where(eq(pages.id, page.id))
				.returning();

			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
			}
			return { id: updated.id, visibility: updated.visibility };
		}),

	versions: protectedProcedure
		.input(pageRefSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const page = await loadPage({
				id: input.id,
				slug: input.slug,
				organizationId,
				userId: ctx.session.user.id,
			});

			return await db
				.select({
					version: pageVersions.version,
					label: pageVersions.label,
					contentType: pageVersions.contentType,
					sizeBytes: pageVersions.sizeBytes,
					sha256: pageVersions.sha256,
					createdAt: pageVersions.createdAt,
					createdByUserId: pageVersions.createdByUserId,
				})
				.from(pageVersions)
				.where(eq(pageVersions.pageId, page.id))
				.orderBy(desc(pageVersions.version));
		}),

	// The returned blob URL is unguessable but not itself gated.
	pull: protectedProcedure
		.input(pullPageSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const page = await loadPage({
				id: input.id,
				organizationId,
				userId: ctx.session.user.id,
			});

			const version =
				input.version ??
				page.sharedVersion ??
				(await latestVersionNumber(page.id));
			if (version === null) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Page has no versions",
				});
			}

			const [row] = await db
				.select()
				.from(pageVersions)
				.where(
					and(
						eq(pageVersions.pageId, page.id),
						eq(pageVersions.version, version),
					),
				)
				.limit(1);

			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Version ${version} not found`,
				});
			}

			let downloadUrl: string;
			try {
				downloadUrl = (await head(row.blobPathname)).url;
			} catch (error) {
				console.error("[pages] head failed", {
					pageId: page.id,
					version,
					error,
				});
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Page content is not available",
				});
			}

			return {
				id: page.id,
				slug: page.slug,
				url: pageUrl(page.slug),
				title: page.title,
				// Projected from the row `loadPage` already fetched, to save a second `get` round trip.
				visibility: page.visibility,
				createdByUserId: page.createdByUserId,
				version: row.version,
				label: row.label,
				contentType: row.contentType,
				sizeBytes: row.sizeBytes,
				sha256: row.sha256,
				createdAt: row.createdAt,
				downloadUrl,
			};
		}),
} satisfies TRPCRouterRecord;
