INSERT INTO "handles" ("handle", "owner_type", "user_id", "created_at", "updated_at")
SELECT "handle", 'user', "user_id", "opted_in_at", now()
FROM "leaderboard_participants"
ON CONFLICT ("handle") DO NOTHING;
--> statement-breakpoint

INSERT INTO "public_profiles" (
	"user_id", "handle", "visibility", "organization_id",
	"opted_in_at", "revoked_at", "flagged_at", "last_published_at",
	"payload_version",
	"tokens", "usd", "sessions",
	"uncached_input", "cached_input", "cache_write_5m", "cache_write_1h",
	"output", "reasoning_output",
	"approximate", "day_range_start", "day_range_end",
	"tier", "tier_computed_at", "active_days",
	"axis_width", "axis_depth", "axis_output", "axis_cost",
	"created_at", "updated_at"
)
SELECT
	"user_id", "handle", "visibility", "organization_id",
	"opted_in_at", "revoked_at", "flagged_at", "last_published_at",
	"payload_version",
	"tokens", "usd", "sessions",
	"uncached_input", "cached_input", "cache_write_5m", "cache_write_1h",
	"output", "reasoning_output",
	"approximate", "day_range_start", "day_range_end",
	"tier", "tier_computed_at", "active_days",
	"axis_width", "axis_depth", "axis_output", "axis_cost",
	"created_at", "updated_at"
FROM "leaderboard_participants"
ON CONFLICT ("user_id") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "leaderboard_daily" DROP CONSTRAINT "leaderboard_daily_user_id_leaderboard_participants_user_id_fk";
--> statement-breakpoint
ALTER TABLE "leaderboard_daily_factory" DROP CONSTRAINT "leaderboard_daily_factory_user_id_leaderboard_participants_user_id_fk";
--> statement-breakpoint
ALTER TABLE "leaderboard_daily" ADD CONSTRAINT "leaderboard_daily_user_id_public_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."public_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_daily_factory" ADD CONSTRAINT "leaderboard_daily_factory_user_id_public_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."public_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
