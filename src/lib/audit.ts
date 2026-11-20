/**
 * @file src/lib/audit.ts
 * @description Records immutable governance events (screen pairing, schedules, broadcasts,
 * data feed syncs, RBAC changes) into the `audit_logs` Postgres table.
 */

import { db, isDatabaseConfigured, auditLogs } from "@/db";

export async function recordAuditLog(params: {
  action: string;
  entityType: string;
  entityId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured()) return;
  try {
    await db.insert(auditLogs).values({
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      userId: params.userId ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // Non-fatal so primary action succeeds even if audit write fails
  }
}
