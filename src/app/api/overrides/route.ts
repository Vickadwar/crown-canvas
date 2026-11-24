/**
 * @file src/app/api/overrides/route.ts
 * @description 3-mode Emergency Broadcast API (`alert` custom message, `media_asset`
 * instant video/image takeover, or `playlist` instant playlist takeover) with Realtime push.
 */

import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, emergencyOverrides, withDbRetry } from "@/db";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";
import { requireAdminAccess } from "@/lib/auth-guard";

const createOverrideSchema = z
  .object({
    title: z.string().min(2).max(180),
    message: z.string().max(1000).default(""),
    overrideKind: z.enum(["alert", "media_asset", "playlist"]).default("alert"),
    mediaAssetId: z.string().uuid().nullable().optional(),
    playlistId: z.string().uuid().nullable().optional(),
    severity: z.enum(["info", "warning", "critical"]).default("warning"),
    departmentId: z.string().uuid().nullable().optional(),
    targetType: z
      .enum(["global", "country", "branch", "screen", "screen_group", "screen_role"])
      .default("global"),
    targetId: z.string().uuid().nullable().optional(),
    targetScreenIds: z.array(z.string().uuid()).max(200).nullable().optional(),
    durationMinutes: z.number().int().min(1).max(43200).nullable().default(30),
  })
  .superRefine((data, ctx) => {
    if (data.overrideKind === "alert" && data.message.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "Provide an alert message for a custom broadcast.",
      });
    }
    if (data.overrideKind === "media_asset" && !data.mediaAssetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaAssetId"],
        message: "Select a video or image clip to broadcast.",
      });
    }
    if (data.overrideKind === "playlist" && !data.playlistId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["playlistId"],
        message: "Select a playlist for emergency takeover.",
      });
    }
  });

export async function GET() {
  await connection();
  if (!isDatabaseConfigured()) {
    return Response.json({ overrides: [] });
  }
  const rows = await withDbRetry(() =>
    db
      .select()
      .from(emergencyOverrides)
      .orderBy(desc(emergencyOverrides.createdAt))
  );
  return Response.json({ overrides: rows });
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createOverrideSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid broadcast payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const expiresAt =
      parsed.data.durationMinutes && parsed.data.durationMinutes > 0
        ? new Date(Date.now() + parsed.data.durationMinutes * 60 * 1000)
        : null;

    const [created] = await withDbRetry(() =>
      db
        .insert(emergencyOverrides)
        .values({
          title: parsed.data.title.trim(),
          message: parsed.data.message.trim(),
          overrideKind: parsed.data.overrideKind,
          mediaAssetId:
            parsed.data.overrideKind === "media_asset"
              ? (parsed.data.mediaAssetId ?? null)
              : null,
          playlistId:
            parsed.data.overrideKind === "playlist"
              ? (parsed.data.playlistId ?? null)
              : null,
          severity: parsed.data.severity,
          departmentId: parsed.data.departmentId ?? null,
          targetType: parsed.data.targetType,
          targetId:
            parsed.data.targetType === "global"
              ? null
              : parsed.data.targetType === "screen" &&
                  parsed.data.targetScreenIds &&
                  parsed.data.targetScreenIds.length === 1
                ? parsed.data.targetScreenIds[0]
                : (parsed.data.targetId ?? null),
          targetScreenIds:
            parsed.data.targetType === "screen" &&
            parsed.data.targetScreenIds &&
            parsed.data.targetScreenIds.length > 0
              ? parsed.data.targetScreenIds
              : null,
          isActive: true,
          expiresAt,
          createdBy: session.userId,
        })
        .returning()
    );

    await broadcastFleetSignal("emergency_override", {
      overrideId: created.id,
      active: true,
      overrideKind: created.overrideKind,
    });

    await recordAuditLog({
      action: "override.broadcast",
      entityType: "emergency_override",
      entityId: created.id,
      userId: session.userId,
      metadata: {
        title: created.title,
        overrideKind: created.overrideKind,
        severity: created.severity,
      },
    });

    return Response.json({ override: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to trigger broadcast",
      },
      { status: 500 }
    );
  }
}
