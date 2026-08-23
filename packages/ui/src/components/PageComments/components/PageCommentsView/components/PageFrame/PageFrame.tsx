import type { Ref } from "react";

interface PageFrameProps {
	/** The page document, framed inline. Mutually exclusive with `src`. */
	html?: string;
	/** URL serving the page under its own CSP. Mutually exclusive with `html`. */
	src?: string;
	title: string;
	ref?: Ref<HTMLIFrameElement>;
	onLoad?: () => void;
}

// `allow-same-origin` is deliberately absent: an opaque origin keeps user-authored
// JavaScript away from our cookies, storage, and DOM.
export function PageFrame({ html, src, title, ref, onLoad }: PageFrameProps) {
	return (
		<iframe
			ref={ref}
			onLoad={onLoad}
			title={title}
			{...(src ? { src } : { srcDoc: html })}
			sandbox="allow-scripts allow-forms allow-popups"
			referrerPolicy="no-referrer"
			allow="fullscreen"
			className="h-full w-full border-0 bg-white"
		/>
	);
}
