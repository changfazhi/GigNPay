CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"paypal_email" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spike_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spike" text NOT NULL,
	"user_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spike_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"kind" text NOT NULL,
	"capture_path" text NOT NULL,
	"declared_mime" text NOT NULL,
	"declared_size" integer NOT NULL,
	"status" text DEFAULT 'presigned' NOT NULL,
	"user_agent" text,
	"device_lat" double precision,
	"device_lng" double precision,
	"device_accuracy_m" real,
	"device_fix_at" timestamp with time zone,
	"geo_error" text,
	"analysis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"analyzed_at" timestamp with time zone,
	CONSTRAINT "spike_uploads_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"paypal_event_id" text PRIMARY KEY NOT NULL,
	"event_type" text,
	"resource_type" text,
	"resource_id" text,
	"verified" boolean NOT NULL,
	"transmission_id" text,
	"raw_body" text NOT NULL,
	"deliveries" integer DEFAULT 1 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pgboss_job_id" text,
	"source" text DEFAULT 'pg-boss' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spike_observations" ADD CONSTRAINT "spike_observations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spike_uploads" ADD CONSTRAINT "spike_uploads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "worker_heartbeats_created_at_idx" ON "worker_heartbeats" USING btree ("created_at");