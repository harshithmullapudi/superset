import { boolean, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { apiRequest } from "../../../lib/plugins/api";

interface CatalogPlugin {
	name: string;
	version: string;
	description: string;
	marketplace: string;
	authMethods: { type: "oauth2" | "api_key" }[];
	installed: boolean;
	enabled: boolean;
	connections: { id: string; account: string | null }[];
	accounts: string[];
}

export default command({
	description:
		"List installed plugins, or everything available with --available",
	options: {
		available: boolean().desc("Include plugins you have not installed"),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "version", "status", "pluginId"],
			["PLUGIN", "VERSION", "STATUS", "PLUGIN ID"],
			[16, 9, 30, 38],
		),
	run: async ({ ctx, options }) => {
		const { plugins } = await apiRequest<{ plugins: CatalogPlugin[] }>(
			ctx.bearer,
			"/api/plugins",
		);

		const visible = options.available
			? plugins
			: plugins.filter((plugin) => plugin.installed);

		const status = (plugin: CatalogPlugin) => {
			if (!plugin.installed) return "available";
			if (!plugin.enabled) return "disabled";
			if (plugin.authMethods.length > 0 && plugin.connections.length === 0) {
				return "needs connection";
			}
			return plugin.accounts.length
				? `connected: ${plugin.accounts.join(", ")}`
				: "installed";
		};

		return {
			data: visible.flatMap((plugin) => {
				const row = {
					name: plugin.name,
					version: plugin.version,
					marketplace: plugin.marketplace,
					status: status(plugin),
					connections: plugin.connections,
					description: plugin.description,
				};
				if (plugin.connections.length === 0) {
					return [{ ...row, pluginId: "", account: null }];
				}
				return plugin.connections.map((connection) => ({
					...row,
					pluginId: connection.id,
					account: connection.account,
				}));
			}),
			message: visible.length
				? `${visible.length} plugin${visible.length === 1 ? "" : "s"}.`
				: "No plugins installed. See what's available: superset plugins list --available",
		};
	},
});
