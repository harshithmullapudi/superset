import { type Ref, useEffect, useState } from "react";
import { cn } from "../../../../../../lib/utils";
import { Spinner } from "../../../../../ui/spinner";

interface PageFrameProps {
	html?: string;
	src?: string;
	title: string;
	ref?: Ref<HTMLIFrameElement>;
	onLoad?: () => void;
}

export function PageFrame({ html, src, title, ref, onLoad }: PageFrameProps) {
	const [loaded, setLoaded] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: src/html are reset triggers — a new document repaints from white, so cover it again until it lands
	useEffect(() => {
		setLoaded(false);
	}, [src, html]);

	return (
		<div className="relative h-full w-full bg-background">
			<iframe
				ref={ref}
				onLoad={() => {
					setLoaded(true);
					onLoad?.();
				}}
				title={title}
				{...(src ? { src } : { srcDoc: html })}
				sandbox="allow-scripts allow-forms allow-popups"
				referrerPolicy="no-referrer"
				allow="fullscreen"
				className={cn(
					"h-full w-full border-0 bg-white",
					loaded ? "opacity-100" : "opacity-0",
				)}
			/>

			{loaded ? null : (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<Spinner className="size-4 text-muted-foreground" />
				</div>
			)}
		</div>
	);
}
