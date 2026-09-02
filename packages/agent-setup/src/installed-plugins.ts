import fs from "node:fs";
import path from "node:path";
import type { PluginSkillSource } from "./managed-skills";
import { resolveSupersetHomeDir } from "./paths";

/** Where the CLI records which plugins are materialized on this machine. */
export function installedPluginsFilePath(): string {
	return path.join(
		resolveSupersetHomeDir(),
		"plugins",
		"installed_plugins.json",
	);
}

interface InstalledPluginRecord {
	name?: unknown;
	installPath?: unknown;
	enabled?: unknown;
}

/**
 * The plugins to provision skills from, read from disk rather than handed in
 * by each caller.
 *
 * Every provisioner on a machine reads this: the desktop at boot, a CLI
 * host-service, `superset plugins sync`. Provisioning is declarative and reaps
 * whatever is absent from the desired set, so a caller that simply left its
 * plugins out would delete the skills another caller had just written — the
 * desktop's next boot would undo every `plugins sync`. One file on disk is
 * what keeps them from disagreeing.
 */
export function readInstalledPluginSources(): PluginSkillSource[] | null {
	const file = installedPluginsFilePath();
	if (!fs.existsSync(file)) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
	} catch {
		return null;
	}

	const plugins = (parsed as { plugins?: unknown })?.plugins;
	if (!Array.isArray(plugins)) return null;

	const sources: PluginSkillSource[] = [];
	for (const entry of plugins as InstalledPluginRecord[]) {
		// Written before `enabled` existed means enabled, matching how the CLI
		// and the desktop both read these records.
		if (entry?.enabled === false) continue;
		if (typeof entry?.name !== "string" || !entry.name) continue;
		if (typeof entry?.installPath !== "string" || !entry.installPath) continue;
		sources.push({ name: entry.name, dir: entry.installPath });
	}
	return sources;
}
