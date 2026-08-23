import { randomUUID } from "node:crypto";

// Pages are framed from this scheme rather than as `srcdoc`, which would inherit the
// renderer's CSP and lose all inline script. A real scheme carries the policy below instead.
export const PAGE_SCHEME = "superset-page";

// A fresh token per registration, so a republish hands back a new URL rather than a cached document.
const contents = new Map<string, string>();

export function registerPageContent(html: string): {
	token: string;
	url: string;
} {
	const token = randomUUID();
	contents.set(token, html);
	return { token, url: `${PAGE_SCHEME}://${token}/` };
}

export function releasePageContent(token: string): void {
	contents.delete(token);
}

export function readPageContent(token: string): string | undefined {
	return contents.get(token);
}

// `default-src 'none'` keeps a user-authored page from phoning home; the sandbox handles the rest.
const PAGE_CSP = [
	"default-src 'none'",
	"script-src 'unsafe-inline'",
	"style-src 'unsafe-inline'",
	"img-src data: blob: https:",
	"media-src data: blob: https:",
	"font-src data: https:",
	"form-action 'none'",
].join("; ");

export function pageProtocolHandler(request: Request): Response {
	const url = new URL(request.url);
	// Only the document lives here: without the path check, a page's relative asset reference would be served the HTML.
	if (url.pathname !== "/") {
		return new Response("Not found", { status: 404 });
	}
	const html = readPageContent(url.hostname);
	if (html === undefined) {
		return new Response("Not found", { status: 404 });
	}
	return new Response(html, {
		status: 200,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Security-Policy": PAGE_CSP,
			"Cache-Control": "no-store",
		},
	});
}
