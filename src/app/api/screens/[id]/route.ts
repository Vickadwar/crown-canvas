import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, screens, screenCommands } from "@/db";
import { broadcastFleetSignal } from "@/lib/realtime";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";

const patchScreenSchema = z.object({
  activePlaylistId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
  orientation: z.enum(["landscape", "portrait"]).optional(),
  displayMode: z
    .enum([
      "landscape_16_9",
      "portrait_9_16",
      "portrait_rotate_90",
      "portrait_rotate_270",
      "ultrawide_21_9",
    ])
    .optional(),
  name: z.string().min(2).max(150).optional(),
  isActive: z.boolean().optional(),
  screenRole: z
    .enum(["showroom_customer", "back_office", "factory_floor", "reception"])
    .optional(),
});

const commandSchema = z.object({
  command: z.enum([
    "reload",
    "clear_cache",
    "identify",
    "restart_player",
    "screenshot",
  ]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchScreenSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid screen update", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { displayMode, ...restFields } = parsed.data;
    let nextMetadata: Record<string, unknown> | undefined;
    let nextOrientation = restFields.orientation;
    if (displayMode) {
      const [current] = await db
        .select({ metadata: screens.metadata })
        .from(screens)
        .where(eq(screens.id, id))
        .limit(1);
      nextMetadata = {
        ...(current?.metadata ?? {}),
        displayMode,
      };
      nextOrientation = displayMode.startsWith("portrait")
        ? "portrait"
        : "landscape";
    }

    const [updated] = await db
      .update(screens)
      .set({
        ...restFields,
        ...(nextOrientation ? { orientation: nextOrientation } : {}),
        ...(nextMetadata ? { metadata: nextMetadata } : {}),
        updatedAt: new Date(),
      })
      .where(eq(screens.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Screen not found" }, { status: 404 });
    }

    await broadcastFleetSignal("manifest_refresh", {
      screenId: id,
      reason: "screen_updated",
    });

    return Response.json({ screen: updated });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update screen" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = commandSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid command", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [cmd] = await db
      .insert(screenCommands)
      .values({
        screenId: id,
        command: parsed.data.command,
        status: "pending",
      })
      .returning();

    await broadcastFleetSignal("screen_command", {
      screenId: id,
      commandId: cmd.id,
      command: cmd.command,
    });

    return Response.json({ command: cmd }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to send command" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;
    const [deleted] = await db
      .delete(screens)
      .where(eq(screens.id, id))
      .returning();

    if (!deleted) {
      return Response.json({ error: "Screen not found" }, { status: 404 });
    }

    await Promise.all([
      broadcastFleetSignal("screen_removed", {
        screenId: id,
        reason: "screen_deleted",
      }),
      recordAuditLog({
        action: "screen.removed",
        entityType: "screen",
        entityId: id,
        userId: session.userId,
        metadata: {
          name: deleted.name,
          branchId: deleted.branchId,
        },
      }),
    ]);

    return Response.json({ ok: true, id: deleted.id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to remove screen" },
      { status: 500 }
    );
  }
}
