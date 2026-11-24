import { z } from "zod";
import { db, isDatabaseConfigured, branches } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";

const dayHoursRuleSchema = z.object({
  open: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const holidayExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(100),
  mode: z.enum(["closed", "open_override"]),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const operatingScheduleSchema = z
  .object({
    days: z.record(z.enum(["0", "1", "2", "3", "4", "5", "6"]), dayHoursRuleSchema),
    exceptions: z.array(holidayExceptionSchema).max(60).default([]),
  })
  .nullable()
  .optional();

const createBranchSchema = z.object({
  countryId: z.string().uuid(),
  code: z.string().min(3).max(32).toUpperCase(),
  name: z.string().min(2).max(150),
  branchType: z.enum(["showroom", "depot", "factory", "hq"]).default("showroom"),
  city: z.string().min(2).max(100),
  address: z.string().optional(),
  phone: z.string().optional(),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/).default("17:30"),
  operatingSchedule: operatingScheduleSchema,
});

export async function POST(request: Request) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid showroom payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [created] = await db.insert(branches).values(parsed.data).returning();
    return Response.json({ branch: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to create branch",
      },
      { status: 500 }
    );
  }
}
