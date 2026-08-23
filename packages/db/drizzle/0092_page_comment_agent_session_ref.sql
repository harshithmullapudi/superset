ALTER TABLE "page_comments" DROP CONSTRAINT "page_comments_agent_session_id_chat_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "page_comments" ALTER COLUMN "agent_session_id" SET DATA TYPE text;