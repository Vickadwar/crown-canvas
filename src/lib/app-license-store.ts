/**
 * @file src/lib/app-license-store.ts
 * @description Server-side shared persistence for Crown Canvas Application Authentication
 * (Trial vs OEM Lifetime Key) stored in existing `audit_logs` (`entity_type = "app_license"`),
 * requiring zero DB migrations while sharing activation status cleanly across all browsers & users.
 */

import { desc, eq } from "drizzle-orm";
import { auditLogs, db, isDatabaseConfigured, withDbRetry } from "@/db";
import {
  DEFAULT_TRIAL_KEY,
  SINGLE_INSTANCE_NOTICE,
  formatLicenseKeyDisplay,
  maskLicenseKey,
  type AppLicenseInfo,
  type LicenseMode,
} from "./app-license";

interface StoredLicenseMetadata {
  mode?: LicenseMode;
  licenseKey?: string;
  activatedAt?: string;
  activatedByName?: string;
}

export async function getSharedAppLicense(
  includeFullKey: boolean
): Promise<AppLicenseInfo> {
  let mode: LicenseMode = "trial";
  let rawKey = DEFAULT_TRIAL_KEY;
  let activatedAt: string | null = null;
  let activatedByName: string | null = null;

  if (isDatabaseConfigured()) {
    try {
      const [latest] = await withDbRetry(() =>
        db
          .select({
            metadata: auditLogs.metadata,
            createdAt: auditLogs.createdAt,
          })
          .from(auditLogs)
          .where(eq(auditLogs.entityType, "app_license"))
          .orderBy(desc(auditLogs.createdAt))
          .limit(1)
      );

      const meta = (latest?.metadata ?? null) as StoredLicenseMetadata | null;
      if (meta?.mode === "oem_lifetime" && meta.licenseKey) {
        mode = "oem_lifetime";
        rawKey = meta.licenseKey;
        activatedAt = meta.activatedAt ?? latest?.createdAt?.toISOString() ?? null;
        activatedByName = meta.activatedByName ?? "Super Admin";
      } else if (meta?.mode === "trial") {
        mode = "trial";
        rawKey = DEFAULT_TRIAL_KEY;
        activatedAt = meta.activatedAt ?? latest?.createdAt?.toISOString() ?? null;
        activatedByName = meta.activatedByName ?? null;
      }
    } catch {
      // Fall back safely to trial status
    }
  }

  return {
    mode,
    statusLabel:
      mode === "oem_lifetime" ? "Lifetime Access Activated" : "Trial Key Active",
    maskedKey: maskLicenseKey(rawKey),
    fullKey: includeFullKey ? formatLicenseKeyDisplay(rawKey) : null,
    activatedAt,
    activatedByName,
    singleInstanceNotice: SINGLE_INSTANCE_NOTICE,
  };
}

export async function saveSharedAppLicense(params: {
  mode: LicenseMode;
  licenseKey: string;
  userId?: string | null;
  activatedByName: string;
}): Promise<AppLicenseInfo> {
  const nowIso = new Date().toISOString();
  if (isDatabaseConfigured()) {
    await withDbRetry(() =>
      db.insert(auditLogs).values({
        userId: params.userId ?? null,
        action:
          params.mode === "oem_lifetime"
            ? "license.oem_activated"
            : "license.trial_selected",
        entityType: "app_license",
        entityId: null,
        metadata: {
          mode: params.mode,
          licenseKey: params.licenseKey,
          maskedKey: maskLicenseKey(params.licenseKey),
          activatedAt: nowIso,
          activatedByName: params.activatedByName,
        },
      })
    );
  }

  return {
    mode: params.mode,
    statusLabel:
      params.mode === "oem_lifetime"
        ? "Lifetime Access Activated"
        : "Trial Key Active",
    maskedKey: maskLicenseKey(params.licenseKey),
    fullKey: formatLicenseKeyDisplay(params.licenseKey),
    activatedAt: nowIso,
    activatedByName: params.activatedByName,
    singleInstanceNotice: SINGLE_INSTANCE_NOTICE,
  };
}
