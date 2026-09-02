import type {
	PluginCatalogEntry,
	PluginCategory,
} from "@superset/shared/plugins";
import { useQuery } from "@tanstack/react-query";
import { env } from "renderer/env.renderer";
import { authClient, useAuthToken } from "renderer/lib/auth-client";

export interface AuthInput {
	name: string;
	label?: string;
	placeholder?: string;
	description?: string;
	required?: boolean;
	secret?: boolean;
}

export interface PluginSkill {
	name: string;
	description: string;
}

export interface AuthMethod {
	type: "oauth2" | "api_key";
	label: string | null;
	inputs: AuthInput[];
}

export interface CatalogPlugin extends PluginCatalogEntry {
	marketplace: string;
	installed: boolean;
	latestVersion: string | null;
	updateAvailable: boolean;
	enabled: boolean;
	accounts: string[];
	pluginSkills: PluginSkill[];
	homepage: string | null;
	author: string | null;
	license: string | null;
}

interface CatalogResponse {
	plugins: {
		name: string;
		version: string;
		description: string;
		marketplace: string;
		displayName: string;
		category: string;
		icon?: string;
		authMethods: {
			type: "oauth2" | "api_key";
			label: string | null;
			inputs: AuthInput[];
		}[];
		mcpUrl: string | null;
		installed: boolean;
		latestVersion: string | null;
		enabled: boolean;
		accounts: string[];
		skills: PluginSkill[];
		homepage: string | null;
		author: string | null;
		license: string | null;
	}[];
}

export const PLUGIN_CATALOG_KEY = ["plugin-catalog"] as const;

export function usePluginCatalog() {
	const token = useAuthToken();

	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;

	const query = useQuery({
		queryKey: [...PLUGIN_CATALOG_KEY, userId],
		enabled: Boolean(token) && Boolean(userId),
		queryFn: async (): Promise<CatalogPlugin[]> => {
			const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/plugins`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(body.error ?? `Request failed (${response.status})`);
			}
			const { plugins } = (await response.json()) as CatalogResponse;

			return plugins.map((plugin) => ({
				name: plugin.name,
				version: plugin.version,
				description: plugin.description,
				interface: {
					displayName: plugin.displayName,
					category: plugin.category as PluginCategory,
				},
				mcpServers: plugin.mcpUrl
					? { [plugin.name]: { type: "http" as const, url: plugin.mcpUrl } }
					: {},
				auth: plugin.authMethods.length ? plugin.authMethods : undefined,
				skills: plugin.skills.map((skill) => skill.name),
				marketplace: plugin.marketplace,
				installed: plugin.installed,
				latestVersion: plugin.latestVersion,
				updateAvailable:
					plugin.installed &&
					plugin.latestVersion !== null &&
					plugin.latestVersion !== plugin.version,
				enabled: plugin.enabled,
				accounts: plugin.accounts,
				pluginSkills: plugin.skills,
				homepage: plugin.homepage,
				author: plugin.author,
				license: plugin.license,
			}));
		},
	});

	return {
		plugins: query.data ?? [],
		isLoading: query.isLoading || !token,
		error: query.error,
	};
}
