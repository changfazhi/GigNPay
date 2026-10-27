import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

const tstz = (name: string) => timestamp(name, { withTimezone: true });

/** Worker-process liveness rows written by the pg-boss heartbeat job. */
export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pgbossJobId: text("pgboss_job_id"),
    source: text("source").notNull().default("pg-boss"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("worker_heartbeats_created_at_idx").on(t.createdAt)],
);

/**
 * Webhook inbox. paypal_event_id is the real PayPal event id, or
 * `unverified:<transmission id>` for deliveries whose signature did not verify.
 */
export const webhookEvents = pgTable("webhook_events", {
  paypalEventId: text("paypal_event_id").primaryKey(),
  eventType: text("event_type"),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  verified: boolean("verified").notNull(),
  transmissionId: text("transmission_id"),
  rawBody: text("raw_body").notNull(),
  deliveries: integer("deliveries").notNull().default(1),
  receivedAt: tstz("received_at").notNull().defaultNow(),
  lastReceivedAt: tstz("last_received_at").notNull().defaultNow(),
});

/** Camera and storage spike: one row per presigned upload. */
export const spikeUploads = pgTable("spike_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  kind: text("kind").notNull(),
  capturePath: text("capture_path").notNull(),
  declaredMime: text("declared_mime").notNull(),
  declaredSize: integer("declared_size").notNull(),
  status: text("status").notNull().default("presigned"),
  userAgent: text("user_agent"),
  deviceLat: doublePrecision("device_lat"),
  deviceLng: doublePrecision("device_lng"),
  deviceAccuracyM: real("device_accuracy_m"),
  deviceFixAt: tstz("device_fix_at"),
  geoError: text("geo_error"),
  analysis: jsonb("analysis"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  analyzedAt: tstz("analyzed_at"),
});

/** Free-form spike results (one row per observation). */
export const spikeObservations = pgTable("spike_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  spike: text("spike").notNull(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  payload: jsonb("payload").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});
