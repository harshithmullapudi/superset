import fs from "node:fs";
import path from "node:path";
import type { PluginSkillSource } from "./managed-skills";
import { resolveSupersetHomeDir } from "./paths";

export function installedPluginsFilePath(): string {
	return path.join(
		resolveSupersetHomeDir(),
		"plugins",
		"installed_plugins.json",
	);
}

interface InstalledPluginRecord {
	name?: unknown;
	marketplace?: unknown;
	installPath?: unknown;
	enabled?: unknown;
}

export function readInstalledPluginSources(): PluginSkillSource[] | null {
	const file = installedPluginsFilePath();

	let raw: string;
	try {
		raw = fs.readFileSync(file, "utf-8");
	} catch (error) {
		return (error as NodeJS.ErrnoException)?.code === "ENOENT" ? [] : null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	const plugins = (parsed as { plugins?: unknown })?.plugins;
	if (!Array.isArray(plugins)) return null;

	const usable: { name: string; marketplace: string; dir: string }[] = [];
	for (const entry of plugins as InstalledPluginRecord[]) {
		if (entry?.enabled === false) continue;
		if (typeof entry?.name !== "string" || !entry.name) continue;
		if (typeof entry?.installPath !== "string" || !entry.installPath) continue;
		usable.push({
			name: entry.name,
			marketplace:
				typeof entry.marketplace === "string" ? entry.marketplace : "",
			dir: entry.installPath,
		});
	}

	const occurrences = new Map<string, number>();
	for (const entry of usable) {
		occurrences.set(entry.name, (occurrences.get(entry.name) ?? 0) + 1);
	}

	return usable.map((entry) => ({
		name:
			(occurrences.get(entry.name) ?? 0) > 1 && entry.marketplace
				? `${entry.marketplace}-${entry.name}`
				: entry.name,
		dir: entry.dir,
	}));
}
