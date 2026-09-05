import { auth } from "@superset/auth/server";
import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import superjson from "superjson";
import { env } from "@/env";

export const dynamic = "force-dynamic";

const PRIVATE = { "cache-control": "private, no-store" } as const;

export async function GET() {
	const incoming = await headers();

	let session = null;
	try {
		session = await auth.api.getSession({ headers: incoming });
	} catch (error) {
		console.error("[marketing/viewer] session error:", error);
	}

	if (!session) {
		return NextResponse.json({ viewer: null }, { headers: PRIVATE });
	}

	const cookie = incoming.get("cookie");
	if (!cookie) {
		return NextResponse.json({ viewer: null }, { headers: PRIVATE });
	}

	const client = createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
				transformer: superjson,
				headers: () => ({ cookie }),
			}),
		],
	});

	try {
		const viewer = await client.leaderboard.viewer.query();
		return NextResponse.json({ viewer }, { headers: PRIVATE });
	} catch (error) {
		console.error("[marketing/viewer] lookup failed:", error);
		return NextResponse.json({ viewer: null }, { headers: PRIVATE });
	}
}
