// Page commenting, shared by the web viewer and the desktop app. Exported piecewise
// because the surrounding chrome belongs to each host, not to the frame.
export { CommentModeToggle } from "./components/CommentModeToggle";
export { PageCommentsView } from "./components/PageCommentsView";
export {
	type PageVisibility,
	PageVisibilityMenu,
} from "./components/PageVisibilityMenu";
export { useFramePointerDown } from "./hooks/useFramePointerDown";
export {
	type CommentDraft,
	CommentProvider,
	type CommentStore,
	type CommentThread,
	type PageComment,
	type PageCommentUser,
	useComments,
} from "./providers/CommentProvider";
export type {
	CommentAnchor,
	FrameRect,
} from "./utils/commentRuntime";
