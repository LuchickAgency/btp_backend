ALTER TABLE "content_media" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_media" ADD COLUMN "is_cover" boolean DEFAULT false NOT NULL;