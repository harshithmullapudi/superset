import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
	createManagedSkills,
	resolveDisabledSkillIds,
} from "@superset/agent-setup";
import { CLIError } from "@superset/cli-framework";
import {
	assertSafeSegment,
	DEFAULT_MARKETPLACE,
	DEFAULT_MARKETPLACE_REF,
	DEFAULT_MARKETPLACE_REPO,
	findInstalled,
	type InstalledPlugin,
	type KnownMarketplace,
	type MarketplaceSource,
	marketplaceManifest,
	marketplacesDir,
	pluginCachePath,
	readInstalledPlugins,
	readKnownMarketplaces,
	skillsRoot,
	writeInstalledPlugins,
	writeKnownMarketplaces,
} from "./host";
import { MARKETPLACE_FILE, type MarketplaceEntry } from "./marketplace";

const git = promisify(execFile);

export function parseMarketplaceSource(input: string): MarketplaceSource {
	if (input.startsWith(".") || input.startsWith("/") || input.startsWith("~")) {
		return {
			kind: "path",
			path: path.resolve(input.replace(/^~/, process.env.HOME ?? "~")),
		};
	}
	const [target, ref] = input.split("#");
	const github = target?.match(
		/^(?:https?:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/,
	);
	if (github?.[1]) {
		return { kind: "github", repo: github[1], ...(ref ? { ref } : {}) };
	}
	throw new CLIError(
		`Could not read "${input}" as a marketplace. Use owner/repo, a GitHub URL, or a local path.`,
	);
}

export interface InstallMarketplaceResult {
	name: string;
	source: MarketplaceSource;
	location: string;
	plugins: number;
	updated: boolean;
}

export async function installMarketplace(
	source: MarketplaceSource,
	options: { name?: string } = {},
): Promise<InstallMarketplaceResult> {
	let location: string;
	let updated = false;

	if (source.kind === "path") {
		location = source.path as string;
		if (!fs.existsSync(path.join(location, MARKETPLACE_FILE))) {
			throw new CLIError(`No ${MARKETPLACE_FILE} in ${location}.`);
		}
	} else {
		const repo = source.repo as string;
		const slug = assertSafeSegment(
			options.name ?? repo.split("/")[1] ?? repo.replace("/", "-"),
			"marketplace name",
		);
		location = path.join(marketplacesDir(), slug);

		const ref = source.ref;

		if (fs.existsSync(path.join(location, ".git"))) {
			await git("git", [
				"-C",
				location,
				"fetch",
				"--depth",
				"1",
				"origin",
				ref ?? "HEAD",
			]);
			await git("git", ["-C", location, "reset", "--hard", "FETCH_HEAD"]);
			updated = true;
		} else {
			fs.mkdirSync(path.dirname(location), { recursive: true });
			try {
				await git("git", [
					"clone",
					"--depth",
					"1",
					...(ref ? ["--branch", ref] : []),
					`https://github.com/${repo}.git`,
					location,
				]);
			} catch (error) {
				throw new CLIError(
					`Could not clone ${repo}${ref ? `#${ref}` : ""}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		if (!fs.existsSync(path.join(location, MARKETPLACE_FILE))) {
			throw new CLIError(
				`${repo} has no ${MARKETPLACE_FILE} at its root; it is not a marketplace.`,
			);
		}
	}

	const manifest = JSON.parse(
		fs.readFileSync(path.join(location, MARKETPLACE_FILE), "utf8"),
	) as { name?: string; plugins?: MarketplaceEntry[] };

	const name = options.name ?? manifest.name;
	if (!name) throw new CLIError(`${MARKETPLACE_FILE} has no name.`);

	const known = readKnownMarketplaces();
	known[name] = {
		source,
		installLocation: location,
		lastUpdated: new Date().toISOString(),
	} satisfies KnownMarketplace;
	writeKnownMarketplaces(known);

	return {
		name,
		source,
		location,
		plugins: manifest.plugins?.length ?? 0,
		updated,
	};
}

export async function ensureDefaultMarketplace(): Promise<void> {
	const known = readKnownMarketplaces();
	if (known[DEFAULT_MARKETPLACE]) return;

	const override = process.env.SUPERSET_DEFAULT_MARKETPLACE_PATH;
	if (override) {
		await installMarketplace(
			{ kind: "path", path: override },
			{ name: DEFAULT_MARKETPLACE },
		);
		return;
	}

	await installMarketplace(
		{
			kind: "github",
			repo: DEFAULT_MARKETPLACE_REPO,
			ref: DEFAULT_MARKETPLACE_REF,
		},
		{ name: DEFAULT_MARKETPLACE },
	);
}

export interface AvailablePlugin {
	marketplace: string;
	entry: MarketplaceEntry;
	installed: boolean;
	installedVersion?: string;
}

export function listAvailable(): AvailablePlugin[] {
	const installed = readInstalledPlugins();
	const out: AvailablePlugin[] = [];
	for (const name of Object.keys(readKnownMarketplaces())) {
		let manifest: ReturnType<typeof marketplaceManifest>;
		try {
			manifest = marketplaceManifest(name);
		} catch {
			continue;
		}
		for (const entry of manifest.plugins ?? []) {
			const match = installed.find(
				(p) => p.name === entry.name && p.marketplace === name,
			);
			out.push({
				marketplace: name,
				entry,
				installed: Boolean(match),
				installedVersion: match?.version,
			});
		}
	}
	return out;
}

function sourceDir(marketplace: string, entry: MarketplaceEntry): string {
	const known = readKnownMarketplaces()[marketplace];
	if (!known)
		throw new CLIError(`Marketplace "${marketplace}" is not installed.`);
	if (typeof entry.source !== "string") {
		throw new CLIError(
			`Plugin "${entry.name}" uses a non-string source, which is not supported.`,
		);
	}
	const root = path.resolve(known.installLocation);
	const dir = path.resolve(root, entry.source);
	const contained = (a: string, b: string) =>
		a === b || a.startsWith(`${b}${path.sep}`);
	const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
	const realDir = fs.existsSync(dir) ? fs.realpathSync(dir) : dir;
	if (!contained(dir, root) || !contained(realDir, realRoot)) {
		throw new CLIError(
			`Plugin "${entry.name}" resolves outside its marketplace.`,
		);
	}
	return dir;
}

function assertNotSymlink(target: string): void {
	let stat: fs.Stats;
	try {
		stat = fs.lstatSync(target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
		throw error;
	}
	if (stat.isSymbolicLink()) {
		throw new CLIError(
			`Refusing to copy "${target}": a plugin cannot ship a symlink.`,
		);
	}
}

function copyTree(from: string, to: string): void {
	assertNotSymlink(from);
	fs.mkdirSync(to, { recursive: true });
	for (const item of fs.readdirSync(from, { withFileTypes: true })) {
		const src = path.join(from, item.name);
		const dest = path.join(to, item.name);
		if (item.isSymbolicLink()) {
			throw new CLIError(
				`Refusing to copy "${src}": a plugin cannot ship a symlink.`,
			);
		}
		if (item.isDirectory()) copyTree(src, dest);
		else if (item.isFile()) fs.copyFileSync(src, dest);
	}
}

export interface InstallPluginResult {
	name: string;
	marketplace: string;
	version: string;
	installPath: string;
	skills: number;
}

export interface InstallPluginOptions {
	update?: boolean;
}

export async function installPlugin(
	name: string,
	marketplace?: string,
	options: InstallPluginOptions = {},
): Promise<InstallPluginResult> {
	const candidates = listAvailable().filter(
		(a) =>
			a.entry.name === name && (!marketplace || a.marketplace === marketplace),
	);

	if (candidates.length === 0) {
		throw new CLIError(
			`No plugin "${name}" in any installed marketplace. Run: superset plugins list --available`,
		);
	}
	if (candidates.length > 1) {
		throw new CLIError(
			`"${name}" exists in ${candidates.map((c) => c.marketplace).join(", ")}. Disambiguate with ${name}@<marketplace>.`,
		);
	}

	const found = candidates[0];
	if (!found) throw new CLIError(`No plugin "${name}".`);
	const { entry } = found;
	const dir = sourceDir(found.marketplace, entry);

	const manifestPath = path.join(dir, "plugin.json");
	if (!fs.existsSync(manifestPath)) {
		throw new CLIError(`Plugin "${name}" has no plugin.json.`);
	}

	const existing = readInstalledPlugins().find(
		(p) => p.name === name && p.marketplace === found.marketplace,
	);
	if (existing && !options.update) {
		const available = entry.version ?? "unknown";
		throw new CLIError(
			existing.version === available
				? `"${name}" is already installed at ${existing.version}.`
				: `"${name}" is already installed at ${existing.version}; ${available} is available.`,
			`Run: superset plugins install ${name} --update`,
		);
	}
	assertNotSymlink(manifestPath);
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
		name?: string;
		version?: string;
	};
	if (manifest.name !== name) {
		throw new CLIError(
			`Marketplace "${found.marketplace}" lists "${name}", but its plugin.json declares "${manifest.name ?? "no name"}"; they must match.`,
		);
	}
	if (entry.version && manifest.version && entry.version !== manifest.version) {
		throw new CLIError(
			`Marketplace "${found.marketplace}" lists "${name}" at ${entry.version}, but its plugin.json declares ${manifest.version}; they must match.`,
		);
	}
	const version = assertSafeSegment(
		entry.version ?? manifest.version ?? "",
		"version",
	);

	assertNotSymlink(path.join(dir, "versions"));
	const versioned = path.join(dir, "versions", version);
	assertNotSymlink(versioned);
	const payload = fs.existsSync(versioned) ? versioned : dir;

	const target = pluginCachePath(found.marketplace, name, version);
	if (fs.existsSync(target)) fs.rmSync(target, { recursive: true });
	fs.mkdirSync(path.dirname(target), { recursive: true });

	if (payload === dir) {
		fs.mkdirSync(target, { recursive: true });
		for (const item of ["plugin.json"]) {
			const src = path.join(dir, item);
			if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, item));
		}
		for (const item of ["skills", "server"]) {
			const src = path.join(dir, item);
			if (fs.existsSync(src)) copyTree(src, path.join(target, item));
		}
	} else {
		copyTree(payload, target);
	}

	const plugins = readInstalledPlugins().filter(
		(p) => !(p.name === name && p.marketplace === found.marketplace),
	);
	plugins.push({
		marketplace: found.marketplace,
		name,
		version,
		installPath: target,
		installedAt: new Date().toISOString(),
		enabled: true,
	} satisfies InstalledPlugin);
	writeInstalledPlugins(plugins);

	const skills = (await syncPlugins()).skills;
	return {
		name,
		marketplace: found.marketplace,
		version,
		installPath: target,
		skills,
	};
}

export async function removePlugin(
	name: string,
	marketplace?: string,
): Promise<InstalledPlugin> {
	const plugins = readInstalledPlugins();
	const match = findInstalled(plugins, name, marketplace);
	if (!match) throw new CLIError(`"${name}" is not installed.`);

	writeInstalledPlugins(plugins.filter((p) => p !== match));
	if (fs.existsSync(match.installPath)) {
		fs.rmSync(match.installPath, { recursive: true });
	}
	await syncPlugins();
	return match;
}

export interface SkillEntry {
	plugin: string;
	marketplace: string;
	skill: string;
	directory: string;
	path: string;
	description: string;
}

function readDescription(contents: string): string {
	const match = contents.match(/^description:\s*(.+)$/m);
	return match?.[1]?.trim() ?? "";
}

export interface SyncResult {
	plugins: number;
	skills: number;
	removed: number;
	entries: SkillEntry[];
}

function skillDirNames(): string[] {
	const root = skillsRoot();
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((item) => item.isDirectory())
		.map((item) => item.name);
}

export async function syncPlugins(): Promise<SyncResult> {
	const installed = readInstalledPlugins().filter((p) => p.enabled);
	const before = new Set(skillDirNames());

	await createManagedSkills({
		disabledSkills: resolveDisabledSkillIds(),
	});

	const after = new Set(skillDirNames());
	const entries = listSkills();

	return {
		plugins: installed.length,
		skills: entries.length,
		removed: [...before].filter((dir) => !after.has(dir)).length,
		entries,
	};
}

export function listSkills(): SkillEntry[] {
	const root = skillsRoot();
	const installed = [...readInstalledPlugins()].sort(
		(a, b) => b.name.length - a.name.length,
	);
	const entries: SkillEntry[] = [];

	for (const directory of skillDirNames()) {
		const owner = installed.find((p) => directory.startsWith(`${p.name}-`));
		if (!owner) continue;
		const dir = path.join(root, directory);
		const skillFile = path.join(dir, "SKILL.md");
		if (!fs.existsSync(skillFile)) continue;

		entries.push({
			plugin: owner.name,
			marketplace: owner.marketplace,
			skill: directory.slice(owner.name.length + 1),
			directory,
			path: dir,
			description: readDescription(fs.readFileSync(skillFile, "utf8")),
		});
	}

	return entries.sort((a, b) => a.directory.localeCompare(b.directory));
}
