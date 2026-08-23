import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

const CASE_INSENSITIVE_FS =
	process.platform === "darwin" || process.platform === "win32";

// A symlinked root (macOS `/tmp` → `/private/tmp`) otherwise re-bases to null,
// and every republish silently mints a new page instead of a version.
function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

// Resolved to absolute, then re-based on the workspace root: absolute removes
// the ambiguity of `./index.html`, relative keeps the key portable when a
// worktree moves. Null means publish unlinked.
export function resolveEntryPath({
	filePath,
	workspacePath,
	cwd = process.cwd(),
}: {
	filePath: string;
	workspacePath: string | undefined;
	cwd?: string;
}): string | null {
	if (!workspacePath) return null;

	const absolute = canonical(resolve(cwd, filePath));
	const root = canonical(resolve(workspacePath));
	const prefix = root.endsWith(sep) ? root : root + sep;

	const inside = CASE_INSENSITIVE_FS
		? absolute.toLowerCase().startsWith(prefix.toLowerCase())
		: absolute.startsWith(prefix);
	if (!inside) return null;

	// Sliced rather than `relative()`d so the on-disk casing survives the
	// case-insensitive comparison above.
	const rel = absolute.slice(prefix.length);
	if (!rel) return null;

	// Compared for equality, so the separator cannot be platform-dependent. Only
	// on Windows, where a POSIX `a\b.html` is a filename rather than a path.
	return process.platform === "win32" ? rel.split("\\").join("/") : rel;
}
