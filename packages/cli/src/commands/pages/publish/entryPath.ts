import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

// `.native` because only the OS call also folds casing to the real on-disk name.
function canonical(path: string): string {
	try {
		return realpathSync.native(path);
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

	// Exact: `process.platform` describes the OS, not the volume, which may hold both `site` and `Site`.
	if (!absolute.startsWith(prefix)) return null;

	const rel = absolute.slice(prefix.length);
	if (!rel) return null;

	// Compared for equality, so the separator cannot be platform-dependent. Only
	// on Windows, where a POSIX `a\b.html` is a filename rather than a path.
	return process.platform === "win32" ? rel.split("\\").join("/") : rel;
}
