/**
 * @file src/db/index.ts
 * @description Drizzle ORM PostgreSQL client configured for Supabase Cloud
 * Transaction/Session Pooler on Vercel serverless & Next.js dev.
 * Includes idle-timeout tuning and automatic single-retry recovery for
 * transient Postgres `57P01` ("terminating connection due to administrator command")
 * pooler disconnects.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  postgresClient: ReturnType<typeof postgres> | undefined;
  drizzleInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

function createPostgresClient(connectionString: string) {
  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");

  return postgres(connectionString, {
    // Required for Supabase Transaction Pooler (port 6543 / Supavisor)
    prepare: false,
    fetch_types: false,
    // Supavisor transaction mode can stall pipelined queries on one socket
    max_pipeline: 1,
    // Keep pool small for Supabase Free Tier + Next.js dev HMR
    max: 4,
    // Close idle connections before Supabase terminates them with 57P01
    idle_timeout: 20,
    max_lifetime: 60 * 5,
    // Fail fast instead of hanging minutes on dropped or stalled sockets
    connect_timeout: 12,
    query_timeout: 12,
    queue_timeout: 10,
    ssl: isLocal ? false : "require",
  });
}

function getInstance() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Copy .env.example to .env.local and add your Supabase connection string."
    );
  }
  if (!globalForDb.postgresClient || !globalForDb.drizzleInstance) {
    globalForDb.postgresClient = createPostgresClient(connectionString);
    globalForDb.drizzleInstance = drizzle(globalForDb.postgresClient, {
      schema,
    });
  }
  return globalForDb.drizzleInstance;
}

export async function resetDbClient(): Promise<void> {
  if (globalForDb.postgresClient) {
    try {
      await globalForDb.postgresClient.end({ timeout: 2 });
    } catch {
      // Ignore cleanup errors on already-terminated sockets
    }
  }
  globalForDb.postgresClient = undefined;
  globalForDb.drizzleInstance = undefined;
}

function isTransientConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e.code || e.cause?.code || "";
  const msg = (e.message || e.cause?.message || "").toLowerCase();
  return (
    code === "57P01" ||
    code === "ECONNRESET" ||
    code === "CONNECTION_CLOSED" ||
    msg.includes("terminating connection") ||
    msg.includes("connection terminated") ||
    msg.includes("write econnreset")
  );
}

/**
 * Executes a database operation and automatically resets the pool + retries once
 * if Supabase terminated an idle connection (Postgres 57P01).
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isTransientConnectionError(err)) {
      await resetDbClient();
      return await fn();
    }
    throw err;
  }
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const instance = getInstance();
    return Reflect.get(instance, prop, instance);
  },
});

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export * from "./schema";
