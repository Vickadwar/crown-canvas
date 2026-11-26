/**
 * @file src/lib/qr-url.ts
 * @description Clean QR destination resolver supporting both:
 *  - `"direct"` mode (default): encodes the real destination URL (e.g. `crownpaints.co.ke`)
 *    so smartphone cameras preview the official brand domain immediately before tapping.
 *  - `"tracked"` mode: encodes the compact `/q/sb` or `/q/sl` redirect on `NEXT_PUBLIC_APP_URL`
 *    (or custom domain like `go.crownpaints.co.ke`) for verified showroom scan analytics.
 */

export type QrTrackingMode = "direct" | "tracked";

export function resolveQrCodeValue(params: {
  destinationUrl: string;
  mode?: QrTrackingMode | string | null;
  kind: "sidebar" | "slide";
  screenId?: string;
  sidebarProfileId?: string;
  quickPostId?: string;
  qrIndex?: number;
  currentOrigin?: string;
  configuredAppUrl?: string;
}): string {
  const cleanDest = params.destinationUrl.trim() || "https://www.crownpaints.co.ke";
  const mode: QrTrackingMode = params.mode === "tracked" ? "tracked" : "direct";

  if (mode === "direct" || !params.screenId) {
    return cleanDest;
  }

  const originRaw = params.currentOrigin?.trim() || "";
  const isLocal =
    originRaw.includes("localhost") || originRaw.includes("127.0.0.1");
  const configuredBase = params.configuredAppUrl?.trim().replace(/\/+$/, "") || "";
  const origin =
    (isLocal || !originRaw) && configuredBase && !configuredBase.includes("localhost")
      ? configuredBase
      : originRaw;

  if (!origin) return cleanDest;

  if (params.kind === "sidebar") {
    const qp = new URLSearchParams({ s: params.screenId });
    if (params.sidebarProfileId) qp.set("sp", params.sidebarProfileId);
    return `${origin}/q/sb?${qp.toString()}`;
  }

  if (!params.quickPostId) return cleanDest;
  const qp = new URLSearchParams({ p: params.quickPostId, s: params.screenId });
  if (params.qrIndex && params.qrIndex > 0) qp.set("i", String(params.qrIndex));
  return `${origin}/q/sl?${qp.toString()}`;
}
