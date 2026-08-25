export function nextSharedVersion(
	picked: number,
	latestVersion: number | null,
): number | null {
	return picked === latestVersion ? null : picked;
}

export function servedVersion(
	sharedVersion: number | null,
	latestVersion: number | null,
): number | null {
	return sharedVersion ?? latestVersion;
}
