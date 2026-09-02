import { auth } from "@superset/auth/server";
import { pluginContext } from "@/lib/plugins/connections";
import { listTools, PluginDispatchError } from "@/lib/plugins/dispatch";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ plugin: string }> },
) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { plugin } = await params;
	const resolved = await pluginContext(session.user.id, plugin);
	if (!resolved.ok) {
		return Response.json(
			{ error: resolved.error },
			{ status: resolved.status },
		);
	}

	try {
		const tools = await listTools(
			resolved.context.manifest,
			resolved.context.scope,
			resolved.context.authMethod,
			resolved.context.bundled,
		);
		return Response.json({ plugin, tools });
	} catch (error) {
		if (error instanceof PluginDispatchError) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		throw error;
	}
}
