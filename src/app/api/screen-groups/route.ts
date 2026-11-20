/**
 * @file src/app/api/screen-groups/route.ts
 * @description Creates `screen_groups` (e.g., "Nairobi Flagship Showrooms") and dispatches
 * bulk fleet operations (playlist swap or remote commands) to all screens in a group.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  db,
  isDatabaseConfigured,
  screenGroups,
  screens,
  screenCommands,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const createGroupSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(300).optional(),
  countryId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

const bulkGroupActionSchema = z.object({
  groupId: z.string().uuid(),
  action: z.enum(["assign_playlist", "reload", "identify", "clear_cache", "screenshot"]),
  playlistId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid screen group payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { session, errorResponse } = await requireAdminAccess({
      disallowAuditor: true,
      countryId: parsed.data.countryId ?? null,
      branchId: parsed.data.branchId ?? null,
      departmentId: parsed.data.departmentId ?? null,
    });
    if (errorResponse) return errorResponse;

    const [group] = await db
      .insert(screenGroups)
      .values({
        name: parsed.data.name,
        description: parsed.data.description,
        countryId: parsed.data.countryId ?? null,
        branchId: parsed.data.branchId ?? null,
        departmentId: parsed.data.departmentId ?? null,
      })
      .returning();

    await recordAuditLog({
      action: "screen_group.created",
      entityType: "screen_group",
      entityId: group.id,
      userId: session.userId,
      metadata: { name: group.name },
    });

    return Response.json({ group }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create screen group",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const parsed = bulkGroupActionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid bulk group action", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { groupId, action, playlistId } = parsed.data;
    const memberScreens = await db
      .select()
      .from(screens)
      .where(eq(screens.groupId, groupId));

    if (memberScreens.length === 0) {
      return Response.json(
        { error: "No screens are assigned to this group yet." },
        { status: 400 }
      );
    }

    if (action === "assign_playlist") {
      await db
        .update(screens)
        .set({ activePlaylistId: playlistId ?? null, updatedAt: new Date() })
        .where(eq(screens.groupId, groupId));

      await Promise.all([
        broadcastFleetSignal("manifest_refresh", {
          groupId,
          reason: "group_playlist_assigned",
        }),
        recordAuditLog({
          action: "screen_group.playlist_assigned",
          entityType: "screen_group",
          entityId: groupId,
          userId: session.userId,
          metadata: {
            affectedScreens: memberScreens.length,
            playlistId: playlistId ?? null,
          },
        }),
      ]);

      return Response.json({ ok: true, affectedScreens: memberScreens.length });
    }

    const insertedCommands = await db
      .insert(screenCommands)
      .values(
        memberScreens.map((scr) => ({
          screenId: scr.id,
          command: action,
          status: "pending" as const,
          issuedBy: session.userId,
        }))
      )
      .returning();

    await Promise.all(
      insertedCommands.map((cmd) =>
        broadcastFleetSignal("screen_command", {
          screenId: cmd.screenId,
          commandId: cmd.id,
          command: cmd.command,
        })
      )
    );

    await recordAuditLog({
      action: `screen_group.command_${action}`,
      entityType: "screen_group",
      entityId: groupId,
      userId: session.userId,
      metadata: { affectedScreens: memberScreens.length },
    });

    return Response.json({ ok: true, affectedScreens: memberScreens.length });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to run bulk group action",
      },
      { status: 500 }
    );
  }
}
