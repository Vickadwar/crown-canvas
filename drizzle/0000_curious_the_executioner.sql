CREATE TYPE "public"."branch_type" AS ENUM('showroom', 'depot', 'factory', 'hq');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'country_manager', 'department_lead', 'branch_manager', 'content_editor', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."screen_command_status" AS ENUM('pending', 'acknowledged', 'executed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."screen_command_type" AS ENUM('reload', 'clear_cache', 'identify', 'restart_player');--> statement-breakpoint
CREATE TYPE "public"."screen_cache_status" AS ENUM('pending', 'downloading', 'synced', 'error');--> statement-breakpoint
CREATE TYPE "public"."screen_hardware" AS ENUM('android_tv', 'mini_pc', 'other');--> statement-breakpoint
CREATE TYPE "public"."screen_orientation" AS ENUM('landscape', 'portrait');--> statement-breakpoint
CREATE TYPE "public"."screen_role" AS ENUM('showroom_customer', 'back_office', 'factory_floor', 'reception');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('video', 'image', 'web_url', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."data_feed_source" AS ENUM('push_webhook', 'google_sheet', 'manual_json');--> statement-breakpoint
CREATE TYPE "public"."playlist_item_kind" AS ENUM('media_asset', 'quick_post', 'web_widget');--> statement-breakpoint
CREATE TYPE "public"."quick_post_template" AS ENUM('she_safety', 'ict_notice', 'marketing_promo', 'customer_service_qr', 'kpi_chart', 'general_announcement');--> statement-breakpoint
CREATE TYPE "public"."override_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."schedule_target_type" AS ENUM('screen', 'screen_group', 'branch', 'country', 'screen_role', 'global');--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"region_id" uuid,
	"code" varchar(32) NOT NULL,
	"name" varchar(150) NOT NULL,
	"branch_type" "branch_type" DEFAULT 'showroom' NOT NULL,
	"city" varchar(100) NOT NULL,
	"address" text,
	"phone" varchar(40),
	"opening_time" varchar(5) DEFAULT '08:00' NOT NULL,
	"closing_time" varchar(5) DEFAULT '17:30' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(3) NOT NULL,
	"name" varchar(100) NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"accent_color" varchar(16) DEFAULT '#1d4ed8' NOT NULL,
	"icon" varchar(48) DEFAULT 'Building2' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"ip_address" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" DEFAULT 'content_editor' NOT NULL,
	"country_id" uuid,
	"branch_id" uuid,
	"department_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(6) NOT NULL,
	"hardware_type" "screen_hardware" DEFAULT 'android_tv' NOT NULL,
	"resolution" varchar(32),
	"user_agent" text,
	"claimed_screen_id" uuid,
	"handoff_token" varchar(128),
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairing_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "screen_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screen_id" uuid NOT NULL,
	"command" "screen_command_type" NOT NULL,
	"payload" jsonb,
	"status" "screen_command_status" DEFAULT 'pending' NOT NULL,
	"issued_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "screen_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"country_id" uuid,
	"branch_id" uuid,
	"department_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"branch_id" uuid NOT NULL,
	"department_id" uuid,
	"group_id" uuid,
	"screen_role" "screen_role" DEFAULT 'showroom_customer' NOT NULL,
	"hardware_type" "screen_hardware" DEFAULT 'android_tv' NOT NULL,
	"orientation" "screen_orientation" DEFAULT 'landscape' NOT NULL,
	"resolution" varchar(32) DEFAULT '1920x1080',
	"device_token_hash" varchar(128),
	"is_paired" boolean DEFAULT false NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"app_version" varchar(32),
	"cache_status" "screen_cache_status" DEFAULT 'pending' NOT NULL,
	"cached_asset_count" integer DEFAULT 0 NOT NULL,
	"storage_used_mb" integer DEFAULT 0 NOT NULL,
	"active_playlist_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screens_device_token_hash_unique" UNIQUE("device_token_hash")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"media_type" "media_type" NOT NULL,
	"storage_path" text NOT NULL,
	"public_url" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size_bytes" bigint DEFAULT 0 NOT NULL,
	"sha256_checksum" varchar(64) NOT NULL,
	"duration_seconds" integer DEFAULT 15 NOT NULL,
	"width" integer,
	"height" integer,
	"thumbnail_url" text,
	"department_id" uuid NOT NULL,
	"country_id" uuid,
	"folder_id" uuid,
	"uploaded_by" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"department_id" uuid,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"name" varchar(150) NOT NULL,
	"department_id" uuid NOT NULL,
	"source_type" "data_feed_source" DEFAULT 'push_webhook' NOT NULL,
	"api_key_hash" varchar(128),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_feeds_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"orientation" "screen_orientation" DEFAULT 'landscape' NOT NULL,
	"zones_config" jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_id" uuid NOT NULL,
	"item_kind" "playlist_item_kind" DEFAULT 'media_asset' NOT NULL,
	"media_asset_id" uuid,
	"quick_post_id" uuid,
	"widget_config" jsonb,
	"zone_id" varchar(48) DEFAULT 'main' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"transition" varchar(32) DEFAULT 'fade' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"department_id" uuid NOT NULL,
	"country_id" uuid,
	"layout_id" uuid,
	"default_duration_seconds" integer DEFAULT 15 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quick_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(180) NOT NULL,
	"template_type" "quick_post_template" NOT NULL,
	"department_id" uuid NOT NULL,
	"country_id" uuid,
	"data_feed_id" uuid,
	"slide_config" jsonb NOT NULL,
	"duration_seconds" integer DEFAULT 15 NOT NULL,
	"created_by" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(180) NOT NULL,
	"message" text NOT NULL,
	"severity" "override_severity" DEFAULT 'warning' NOT NULL,
	"department_id" uuid,
	"target_type" "schedule_target_type" DEFAULT 'global' NOT NULL,
	"target_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"playlist_id" uuid NOT NULL,
	"target_type" "schedule_target_type" NOT NULL,
	"target_id" uuid,
	"target_screen_role" "screen_role",
	"priority" integer DEFAULT 10 NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"days_of_week" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"daypart_start" varchar(5) DEFAULT '00:00' NOT NULL,
	"daypart_end" varchar(5) DEFAULT '23:59' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_of_play_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screen_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"playlist_id" uuid,
	"media_asset_id" uuid,
	"quick_post_id" uuid,
	"department_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"duration_played_seconds" integer NOT NULL,
	"completed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_code" varchar(32) NOT NULL,
	"screen_id" uuid,
	"branch_id" uuid,
	"quick_post_id" uuid,
	"target_url" text NOT NULL,
	"user_agent" text,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_scopes" ADD CONSTRAINT "user_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_scopes" ADD CONSTRAINT "user_scopes_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_scopes" ADD CONSTRAINT "user_scopes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_scopes" ADD CONSTRAINT "user_scopes_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_claimed_screen_id_screens_id_fk" FOREIGN KEY ("claimed_screen_id") REFERENCES "public"."screens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_commands" ADD CONSTRAINT "screen_commands_screen_id_screens_id_fk" FOREIGN KEY ("screen_id") REFERENCES "public"."screens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_commands" ADD CONSTRAINT "screen_commands_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_groups" ADD CONSTRAINT "screen_groups_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_groups" ADD CONSTRAINT "screen_groups_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_groups" ADD CONSTRAINT "screen_groups_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screens" ADD CONSTRAINT "screens_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screens" ADD CONSTRAINT "screens_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screens" ADD CONSTRAINT "screens_group_id_screen_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."screen_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_feeds" ADD CONSTRAINT "data_feeds_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_quick_post_id_quick_posts_id_fk" FOREIGN KEY ("quick_post_id") REFERENCES "public"."quick_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_layout_id_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."layouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_posts" ADD CONSTRAINT "quick_posts_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_posts" ADD CONSTRAINT "quick_posts_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_posts" ADD CONSTRAINT "quick_posts_data_feed_id_data_feeds_id_fk" FOREIGN KEY ("data_feed_id") REFERENCES "public"."data_feeds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_posts" ADD CONSTRAINT "quick_posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_overrides" ADD CONSTRAINT "emergency_overrides_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_overrides" ADD CONSTRAINT "emergency_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_play_logs" ADD CONSTRAINT "proof_of_play_logs_screen_id_screens_id_fk" FOREIGN KEY ("screen_id") REFERENCES "public"."screens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_play_logs" ADD CONSTRAINT "proof_of_play_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_play_logs" ADD CONSTRAINT "proof_of_play_logs_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_play_logs" ADD CONSTRAINT "proof_of_play_logs_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_play_logs" ADD CONSTRAINT "proof_of_play_logs_quick_post_id_quick_posts_id_fk" FOREIGN KEY ("quick_post_id") REFERENCES "public"."quick_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_play_logs" ADD CONSTRAINT "proof_of_play_logs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_screen_id_screens_id_fk" FOREIGN KEY ("screen_id") REFERENCES "public"."screens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_quick_post_id_quick_posts_id_fk" FOREIGN KEY ("quick_post_id") REFERENCES "public"."quick_posts"("id") ON DELETE set null ON UPDATE no action;