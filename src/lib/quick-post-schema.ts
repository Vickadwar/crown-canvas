/**
 * @file src/lib/quick-post-schema.ts
 * @description Shared Zod validation schemas for Crown Studio Quick Posts,
 * Canva-style `StudioCanvasDoc` vector documents, and custom reusable templates.
 */

import { z } from "zod";

export const studioElementSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum([
    "text",
    "badge",
    "shape",
    "icon",
    "swatch",
    "price_tag",
    "image",
    "qr",
    "emblem",
    "chart_bar",
    "chart_donut",
    "chart_progress",
    "table_spec",
    "separator",
    "step_number",
    "list_block",
  ]),
  label: z.string().min(1).max(120),
  x: z.number().min(-20).max(120),
  y: z.number().min(-20).max(120),
  w: z.number().min(0.5).max(140),
  h: z.number().min(0.5).max(140),
  zIndex: z.number().int().min(0).max(500),
  rotation: z.number().min(-360).max(360).optional(),
  opacity: z.number().min(0).max(1).optional(),
  locked: z.boolean().optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  text: z.string().max(1200).optional(),
  subtext: z.string().max(400).optional(),
  currency: z.enum(["KES", "TZS", "UGX"]).optional(),
  fontFamily: z
    .enum([
      "satoshi",
      "playfair",
      "oswald",
      "montserrat",
      "space_grotesk",
      "bebas",
      "jetbrains_mono",
    ])
    .optional(),
  fontSize: z.number().min(8).max(260).optional(),
  fontWeight: z.enum(["400", "500", "600", "700", "800", "900"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  lineHeight: z.number().min(0.8).max(2.5).optional(),
  uppercase: z.boolean().optional(),
  letterSpacing: z.number().min(-4).max(24).optional(),
  color: z.string().max(64).optional(),
  shapeKind: z
    .enum([
      "rect",
      "circle",
      "pill",
      "line",
      "stripe",
      "triangle",
      "diamond",
      "arrow_right",
      "chevron",
      "star",
      "ring",
    ])
    .optional(),
  fill: z.string().max(240).optional(),
  borderColor: z.string().max(64).optional(),
  borderWidth: z.number().min(0).max(24).optional(),
  borderRadius: z.number().min(0).max(200).optional(),
  iconName: z.string().max(64).optional(),
  swatchHex: z.string().max(32).optional(),
  swatchCode: z.string().max(80).optional(),
  imageUrl: z.string().max(1000).optional(),
  objectFit: z.enum(["cover", "contain"]).optional(),
  qrUrl: z.string().max(500).optional(),
  qrLabel: z.string().max(100).optional(),
  chartTitle: z.string().max(140).optional(),
  chartSeries: z
    .array(
      z.object({
        label: z.string().max(60),
        value: z.number(),
        target: z.number().optional(),
      })
    )
    .max(16)
    .optional(),
  donutSlices: z
    .array(
      z.object({
        name: z.string().max(60),
        value: z.number().nonnegative(),
        color: z.string().max(32),
      })
    )
    .max(12)
    .optional(),
  centerLabel: z.string().max(60).optional(),
  centerValue: z.string().max(40).optional(),
  barColor: z.string().max(32).optional(),
  secondaryColor: z.string().max(32).optional(),
  showGrid: z.boolean().optional(),
  progressValue: z.number().min(0).max(10000).optional(),
  progressMax: z.number().positive().max(10000).optional(),
  progressStyle: z.enum(["bar", "ring"]).optional(),
  trackColor: z.string().max(64).optional(),
  tableHeaders: z.array(z.string().max(80)).max(8).optional(),
  tableRows: z.array(z.array(z.string().max(120)).max(8)).max(12).optional(),
  separatorStyle: z.enum(["solid", "dashed", "dotted", "gradient"]).optional(),
  separatorOrientation: z.enum(["horizontal", "vertical"]).optional(),
  lineThickness: z.number().min(1).max(24).optional(),
  stepNumber: z.string().max(12).optional(),
  stepStyle: z.enum(["circle", "square", "outline"]).optional(),
  listStyle: z.enum(["numbered", "check", "bullet"]).optional(),
  listItems: z.array(z.string().max(200)).max(12).optional(),
});

export const studioCanvasDocSchema = z.object({
  version: z.literal(1),
  orientation: z.enum(["landscape", "portrait"]),
  backgroundPreset: z.string().max(80),
  backgroundCss: z.string().max(400),
  backgroundColor: z.string().max(64).optional(),
  backgroundImageUrl: z.string().max(1000).optional(),
  accentColor: z.string().max(64).optional(),
  elements: z.array(studioElementSchema).max(60),
});

export const studioTemplatePayloadSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(400).optional(),
  category: z
    .enum(["decorative", "automotive", "industrial", "department", "custom"])
    .default("custom"),
  departmentCode: z.string().max(32).nullable().optional(),
  orientation: z.enum(["landscape", "portrait"]).default("landscape"),
  canvasDoc: studioCanvasDocSchema,
});

export const quickPostPayloadSchema = z.object({
  title: z.string().min(2).max(180),
  templateType: z.enum([
    "she_safety",
    "ict_notice",
    "marketing_promo",
    "customer_service_qr",
    "kpi_chart",
    "hr_spotlight",
    "general_announcement",
  ]),
  departmentId: z.string().uuid(),
  countryId: z.string().uuid().nullable().optional(),
  dataFeedId: z.string().uuid().nullable().optional(),
  durationSeconds: z.number().int().min(5).max(120).default(15),
  slideConfig: z.object({
    headline: z.string().min(1).max(160),
    subheadline: z.string().max(240).optional(),
    body: z.string().max(500).optional(),
    badgeText: z.string().max(60).optional(),
    metricValue: z.string().max(40).optional(),
    metricLabel: z.string().max(80).optional(),
    currency: z.enum(["KES", "TZS", "UGX"]).optional(),
    price: z.string().max(40).optional(),
    qrUrl: z.string().url().optional().or(z.literal("")),
    qrLabel: z.string().max(60).optional(),
    personName: z.string().max(120).optional(),
    personRole: z.string().max(120).optional(),
    personBranch: z.string().max(120).optional(),
    backgroundTheme: z
      .enum([
        "crown_navy",
        "crown_gold",
        "she_emerald",
        "ict_slate",
        "hr_violet",
        "light",
      ])
      .optional(),
    chartData: z
      .array(
        z.object({
          label: z.string(),
          value: z.number(),
          target: z.number().optional(),
        })
      )
      .optional(),
    kpis: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
          delta: z.string().optional(),
        })
      )
      .optional(),
    categoryMix: z
      .array(
        z.object({
          name: z.string(),
          value: z.number(),
          color: z.string(),
        })
      )
      .optional(),
    canvasDoc: studioCanvasDocSchema.optional(),
  }),
});
