import { positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { apiRequest } from "../../../lib/plugins/api";
import { resolvePluginRef } from "../../../lib/plugins/host";
import { removePlugin } from "../../../lib/plugins/install";

export default command({
	description: "Uninstall a plugin and drop its skills",
	args: [
		positional("plugin")
			.required()
			.desc("Plugin name, or name@marketplace to disambiguate"),
	],
	options: {
		marketplace: string().desc(
			"Which marketplace's install to remove, when several offer this name",
		),
	},
	run: async ({ ctx, args, options }) => {
		const { name, marketplace } = resolvePluginRef(
			args.plugin as string,
			options.marketplace as string | undefined,
		);

		const query = marketplace
			? `?marketplace=${encodeURIComponent(marketplace)}`
			: "";
		await apiRequest(ctx.bearer, `/api/plugins/${name}/install${query}`, {
			method: "DELETE",
		});

		const removed = await removePlugin(name, marketplace);

		return {
			data: { name: removed.name, marketplace: removed.marketplace },
			message: `Removed ${removed.name}@${removed.version} (${removed.marketplace}).`,
		};
	},
});
