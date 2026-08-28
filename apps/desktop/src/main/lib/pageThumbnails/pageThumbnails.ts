import {
	mkdir,
	readdir,
	readFile,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, session } from "electron";
import {
	PAGE_SCHEME,
	pageProtocolHandler,
	registerPageContent,
	releasePageContent,
} from "../pageContent";

export const THUMBNAIL_SCHEME = "superset-thumb";

const THUMBNAIL_PARTITION = "page-thumbnails";

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 880;
const THUMBNAIL_WIDTH = 640;
const THUMBNAIL_HEIGHT = 440;
const JPEG_QUALITY = 80;

const MAX_CACHED_THUMBNAILS = 512;
const MAX_CONCURRENT_CAPTURES = 2;

const CAPTURE_DEADLINE_MS = 15_000;
const CAPTURE_ATTEMPT_TIMEOUT_MS = 1_500;
const CAPTURE_RETRY_INTERVAL_MS = 100;
const LOAD_TIMEOUT_MS = 10_000;
const SETTLE_MS = 400;

const PAGE_ID_PATTERN = /^[a-zA-Z0-9-]+$/;
const VERSION_PATTERN = /^\d+$/;

function cacheDir(): string {
	return join(app.getPath("userData"), "page-thumbnails");
}

function thumbnailPath(pageId: string, version: string): string {
	return join(cacheDir(), `${pageId}-${version}.jpg`);
}

export function thumbnailUrl(pageId: string, version: string): string {
	return `${THUMBNAIL_SCHEME}://${pageId}/${version}`;
}

function isValidKey(pageId: string, version: string): boolean {
	return PAGE_ID_PATTERN.test(pageId) && VERSION_PATTERN.test(version);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(message)), ms);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

let activeCaptures = 0;
const captureQueue: Array<() => void> = [];

async function acquireCaptureSlot(): Promise<void> {
	if (activeCaptures < MAX_CONCURRENT_CAPTURES) {
		activeCaptures += 1;
		return;
	}
	await new Promise<void>((resolve) => captureQueue.push(resolve));
	activeCaptures += 1;
}

function releaseCaptureSlot(): void {
	activeCaptures -= 1;
	const next = captureQueue.shift();
	if (next) next();
}

async function captureWithRetry(
	window: BrowserWindow,
): Promise<Electron.NativeImage> {
	const deadline = Date.now() + CAPTURE_DEADLINE_MS;
	let lastError: unknown = null;
	do {
		if (window.isDestroyed()) break;
		try {
			const image = await withTimeout(
				window.webContents.capturePage(),
				CAPTURE_ATTEMPT_TIMEOUT_MS,
				"Thumbnail capture attempt timed out",
			);
			if (!image.isEmpty()) return image;
			lastError = new Error("Thumbnail capture produced an empty image");
		} catch (error) {
			lastError = error;
		}
		await delay(CAPTURE_RETRY_INTERVAL_MS);
	} while (Date.now() < deadline);

	throw lastError instanceof Error
		? lastError
		: new Error("Thumbnail capture failed");
}

let partitionReady = false;

function ensurePartitionProtocol(): void {
	if (partitionReady) return;
	partitionReady = true;
	const partition = session.fromPartition(THUMBNAIL_PARTITION);
	if (!partition.protocol.isProtocolHandled(PAGE_SCHEME)) {
		partition.protocol.handle(PAGE_SCHEME, pageProtocolHandler);
	}
}

async function captureHtml(html: string): Promise<Buffer> {
	ensurePartitionProtocol();
	const { token, url } = registerPageContent(html);
	const window = new BrowserWindow({
		show: false,
		paintWhenInitiallyHidden: true,
		width: FRAME_WIDTH,
		height: FRAME_HEIGHT,
		webPreferences: {
			partition: THUMBNAIL_PARTITION,
			backgroundThrottling: false,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			spellcheck: false,
		},
	});

	try {
		window.webContents.setAudioMuted(true);
		await Promise.race([
			window.loadURL(url).catch(() => undefined),
			delay(LOAD_TIMEOUT_MS),
		]);
		if (window.isDestroyed()) {
			throw new Error("Thumbnail window closed before capture");
		}
		await delay(SETTLE_MS);
		const image = await captureWithRetry(window);
		return image
			.resize({
				width: THUMBNAIL_WIDTH,
				height: THUMBNAIL_HEIGHT,
				quality: "good",
			})
			.toJPEG(JPEG_QUALITY);
	} finally {
		releasePageContent(token);
		if (!window.isDestroyed()) window.destroy();
	}
}

let pruning = false;

async function pruneCache(): Promise<void> {
	if (pruning) return;
	pruning = true;
	try {
		const dir = cacheDir();
		const names = await readdir(dir);
		if (names.length <= MAX_CACHED_THUMBNAILS) return;

		const entries = await Promise.all(
			names.map(async (name) => {
				try {
					const info = await stat(join(dir, name));
					return { name, mtimeMs: info.mtimeMs };
				} catch {
					return null;
				}
			}),
		);

		const sorted = entries
			.filter((entry): entry is { name: string; mtimeMs: number } =>
				Boolean(entry),
			)
			.sort((a, b) => a.mtimeMs - b.mtimeMs);

		const excess = sorted.length - MAX_CACHED_THUMBNAILS;
		await Promise.all(
			sorted
				.slice(0, excess)
				.map((entry) => unlink(join(dir, entry.name)).catch(() => undefined)),
		);
	} catch {
		return;
	} finally {
		pruning = false;
	}
}

async function hasThumbnail(pageId: string, version: string): Promise<boolean> {
	try {
		await stat(thumbnailPath(pageId, version));
		return true;
	} catch {
		return false;
	}
}

export async function peekThumbnail(
	pageId: string,
	version: string,
): Promise<string | null> {
	if (!isValidKey(pageId, version)) return null;
	return (await hasThumbnail(pageId, version))
		? thumbnailUrl(pageId, version)
		: null;
}

const inflight = new Map<string, Promise<string>>();

export function ensureThumbnail({
	pageId,
	version,
	html,
}: {
	pageId: string;
	version: string;
	html: string;
}): Promise<string> {
	if (!isValidKey(pageId, version)) {
		return Promise.reject(new Error("Invalid thumbnail key"));
	}

	const key = `${pageId}:${version}`;
	const existing = inflight.get(key);
	if (existing) return existing;

	const pending: Promise<string> = (async () => {
		if (await hasThumbnail(pageId, version)) {
			return thumbnailUrl(pageId, version);
		}

		await acquireCaptureSlot();
		try {
			const jpeg = await captureHtml(html);
			await mkdir(cacheDir(), { recursive: true });
			await writeFile(thumbnailPath(pageId, version), jpeg);
			void pruneCache();
			return thumbnailUrl(pageId, version);
		} finally {
			releaseCaptureSlot();
		}
	})().finally(() => {
		if (inflight.get(key) === pending) inflight.delete(key);
	});

	inflight.set(key, pending);
	return pending;
}

export async function thumbnailProtocolHandler(
	request: Request,
): Promise<Response> {
	const url = new URL(request.url);
	const pageId = url.hostname;
	const version = url.pathname.replace(/^\//, "");

	if (!isValidKey(pageId, version)) {
		return new Response("Not found", { status: 404 });
	}

	try {
		const bytes = await readFile(thumbnailPath(pageId, version));
		return new Response(new Uint8Array(bytes), {
			status: 200,
			headers: {
				"Content-Type": "image/jpeg",
				"Cache-Control": "public, max-age=31536000, immutable",
			},
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
}
