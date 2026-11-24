/**
 * @file src/app/api/auth/license/route.ts
 * @description Super-Admin-only Application Authentication & OEM Lifetime Key activation API.
 * Non-Super-Admin users receive only masked status metadata and are blocked (`403`) from updates.
 */

import { connection } from "next/server";
import { z } from "zod";
import { requireAdminAccess } from "@/lib/auth-guard";
import { DEFAULT_TRIAL_KEY, verifyOemLicenseKey } from "@/lib/app-license";
import {
  getSharedAppLicense,
  saveSharedAppLicense,
} from "@/lib/app-license-store";

const updateLicenseSchema = z.object({
  mode: z.enum(["trial", "oem_lifetime"]),
  licenseKey: z.string().trim().max(80).optional(),
});

export async function GET() {
  await connection();
  const { session, errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  const isSuper = Boolean(
    !session.enforceAuth ||
      session.scopes.some((s) => s.role === "super_admin")
  );
  const license = await getSharedAppLicense(isSuper);
  return Response.json({ license, canManage: isSuper });
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  const isSuper = Boolean(
    !session.enforceAuth ||
      session.scopes.some((s) => s.role === "super_admin")
  );
  if (!isSuper) {
    return Response.json(
      { error: "Only Super Administrators can modify Application Authentication licenses." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = updateLicenseSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid license update payload." },
        { status: 400 }
      );
    }

    if (parsed.data.mode === "trial") {
      const license = await saveSharedAppLicense({
        mode: "trial",
        licenseKey: DEFAULT_TRIAL_KEY,
        userId: session.userId,
        activatedByName: session.fullName || session.email || "Super Admin",
      });
      return Response.json({ license });
    }

    const check = verifyOemLicenseKey(
      parsed.data.licenseKey ?? "",
      process.env.APP_OEM_LICENSE_KEY
    );
    if (!check.valid) {
      return Response.json(
        { error: check.reason || "Invalid 32-character OEM activation key." },
        { status: 400 }
      );
    }

    const license = await saveSharedAppLicense({
      mode: "oem_lifetime",
      licenseKey: check.normalizedKey,
      userId: session.userId,
      activatedByName: session.fullName || session.email || "Super Admin",
    });

    return Response.json({ license });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update application license",
      },
      { status: 500 }
    );
  }
}
