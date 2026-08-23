"use client";

import { Button } from "@superset/ui/button";
import { useEffect } from "react";

// Reached when the record resolved but its content could not be read; `not-found` covers a missing page.
export default function PageViewerError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[pages] viewer error", error);
	}, [error]);

	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
			<p className="font-medium text-sm">This page could not be loaded</p>
			<p className="max-w-sm text-muted-foreground text-xs">
				The page exists, but its content could not be fetched. This is usually
				temporary.
			</p>
			<Button size="sm" variant="outline" onClick={reset}>
				Try again
			</Button>
		</div>
	);
}
