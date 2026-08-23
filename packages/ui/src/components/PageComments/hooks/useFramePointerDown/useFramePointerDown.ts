"use client";

import { useEffect, useRef } from "react";
import { useComments } from "../../providers/CommentProvider";

/** Runs `onPointerDown` when the reader presses inside the framed page, which raises no event here. */
export function useFramePointerDown(onPointerDown: () => void) {
	const { framePointerDownAt } = useComments();
	// Seeded at mount so opening a menu because of a press does not close it on that same press.
	const seen = useRef(framePointerDownAt);

	useEffect(() => {
		// Also makes a changed `onPointerDown` identity harmless: no new press, nothing happens.
		if (framePointerDownAt === seen.current) return;
		seen.current = framePointerDownAt;
		onPointerDown();
	}, [framePointerDownAt, onPointerDown]);
}
