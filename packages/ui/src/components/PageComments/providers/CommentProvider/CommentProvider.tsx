"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { CommentAnchor, FrameRect } from "../../utils/commentRuntime";

// Supplied by the host app: web reads it from better-auth, desktop from its own session.
export interface PageCommentUser {
	id: string;
	name: string;
	image: string | null;
}

export interface PageComment {
	id: string;
	authorName: string;
	authorImage: string | null;
	body: string;
	createdAt: number;
}

export interface CommentThread {
	id: string;
	anchor: CommentAnchor;
	comments: PageComment[];
	resolved: boolean;
}

// Held separately from threads so an abandoned composer leaves nothing behind.
export interface CommentDraft {
	anchor: CommentAnchor;
	rect: FrameRect;
}

/** How threads are read and written; each host supplies its own so one component serves both. */
export interface CommentStore {
	threads: CommentThread[];
	isLoading: boolean;
	/** Resolves only once the thread list has been refetched; rejects on failure, which the store reports. */
	createThread: (input: {
		anchor: CommentAnchor;
		anchorText: string;
		body: string;
	}) => Promise<void>;
	addReply: (threadId: string, body: string) => Promise<void>;
	editComment: (
		threadId: string,
		commentId: string,
		body: string,
	) => Promise<void>;
	setResolved: (threadId: string, resolved: boolean) => Promise<void>;
	deleteThread: (threadId: string) => Promise<void>;
}

interface CommentContextValue extends CommentStore {
	user: PageCommentUser;
	/** A create or reply is in flight. */
	submitting: boolean;
	/** The thread whose resolve/delete is in flight, if any. */
	busyThreadId: string | null;
	/** Bumped on every press inside the frame, which raises no event in this document. */
	framePointerDownAt: number;
	notifyFramePointerDown: () => void;
	enabled: boolean;
	toggleEnabled: () => void;
	draft: CommentDraft | null;
	openDraft: (draft: CommentDraft) => void;
	discardDraft: () => void;
	activeThreadId: string | null;
	setActiveThreadId: (id: string | null) => void;
	hoverRect: FrameRect | null;
	setHoverRect: (rect: FrameRect | null) => void;
	rects: Record<string, FrameRect | null>;
	setRects: (entries: { id: string; rect: FrameRect | null }[]) => void;
}

const CommentContext = createContext<CommentContextValue | null>(null);

export function useComments(): CommentContextValue {
	const value = useContext(CommentContext);
	if (!value) {
		throw new Error("useComments must be used inside CommentProvider");
	}
	return value;
}

/** Owns viewing state only — comment mode, the open card, on-screen positions; thread data lives in the store. */
export function CommentProvider({
	user,
	store,
	children,
}: {
	user: PageCommentUser;
	store: CommentStore;
	children: ReactNode;
}) {
	const [enabled, setEnabled] = useState(false);
	const [draft, setDraft] = useState<CommentDraft | null>(null);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [hoverRect, setHoverRect] = useState<FrameRect | null>(null);
	const [rects, setRectState] = useState<Record<string, FrameRect | null>>({});
	const [submitting, setSubmitting] = useState(false);
	const [busyThreadId, setBusyThreadId] = useState<string | null>(null);
	const [framePointerDownAt, setFramePointerDownAt] = useState(0);
	// A ref keeps `discardDraft` stable, so the frame's pointer-down handler is not rebound per keystroke.
	const submittingRef = useRef(false);

	const toggleEnabled = useCallback(() => {
		setEnabled((previous) => {
			// Leaving comment mode closes anything it opened.
			if (previous) {
				setDraft(null);
				setActiveThreadId(null);
				setHoverRect(null);
			}
			return !previous;
		});
	}, []);

	const openDraft = useCallback((next: CommentDraft) => {
		setActiveThreadId(null);
		setDraft(next);
	}, []);

	const notifyFramePointerDown = useCallback(
		() => setFramePointerDownAt((count) => count + 1),
		[],
	);

	const discardDraft = useCallback(() => {
		// A submit in flight owns the composer: no dismissal may discard unsent text.
		if (submittingRef.current) return;
		setDraft(null);
	}, []);

	const setRects = useCallback(
		(entries: { id: string; rect: FrameRect | null }[]) => {
			setRectState(Object.fromEntries(entries.map((e) => [e.id, e.rect])));
		},
		[],
	);

	// Holds the card open until the refetch settles, so the reader never sees a stale overlay.
	const runSubmit = useCallback(async (work: () => Promise<void>) => {
		submittingRef.current = true;
		setSubmitting(true);
		try {
			await work();
			return true;
		} catch {
			// The store reports the failure; the composer stays open with the text intact.
			return false;
		} finally {
			submittingRef.current = false;
			setSubmitting(false);
		}
	}, []);

	const createThread = useCallback<CommentStore["createThread"]>(
		async (input) => {
			const ok = await runSubmit(() => store.createThread(input));
			if (ok) setDraft(null);
		},
		[runSubmit, store],
	);

	const addReply = useCallback<CommentStore["addReply"]>(
		async (threadId, body) => {
			await runSubmit(() => store.addReply(threadId, body));
		},
		[runSubmit, store],
	);

	const editComment = useCallback<CommentStore["editComment"]>(
		async (threadId, commentId, body) => {
			await runSubmit(() => store.editComment(threadId, commentId, body));
		},
		[runSubmit, store],
	);

	const runThreadAction = useCallback(
		async (threadId: string, work: () => Promise<void>) => {
			setBusyThreadId(threadId);
			try {
				await work();
				setActiveThreadId(null);
			} catch {
				// Reported by the store; the card stays open on the failed thread.
			} finally {
				setBusyThreadId(null);
			}
		},
		[],
	);

	const setResolved = useCallback<CommentStore["setResolved"]>(
		(threadId, resolved) =>
			runThreadAction(threadId, () => store.setResolved(threadId, resolved)),
		[runThreadAction, store],
	);

	const deleteThread = useCallback<CommentStore["deleteThread"]>(
		(threadId) => runThreadAction(threadId, () => store.deleteThread(threadId)),
		[runThreadAction, store],
	);

	const value = useMemo<CommentContextValue>(
		() => ({
			user,
			threads: store.threads,
			isLoading: store.isLoading,
			addReply,
			editComment,
			createThread,
			setResolved,
			deleteThread,
			submitting,
			busyThreadId,
			framePointerDownAt,
			notifyFramePointerDown,
			enabled,
			toggleEnabled,
			draft,
			openDraft,
			discardDraft,
			activeThreadId,
			setActiveThreadId,
			hoverRect,
			setHoverRect,
			rects,
			setRects,
		}),
		[
			user,
			store.threads,
			store.isLoading,
			addReply,
			editComment,
			createThread,
			setResolved,
			deleteThread,
			submitting,
			busyThreadId,
			framePointerDownAt,
			notifyFramePointerDown,
			enabled,
			toggleEnabled,
			draft,
			openDraft,
			discardDraft,
			activeThreadId,
			hoverRect,
			rects,
			setRects,
		],
	);

	return (
		<CommentContext.Provider value={value}>{children}</CommentContext.Provider>
	);
}
