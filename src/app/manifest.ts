/**
 * @file src/app/manifest.ts
 * @description PWA Web App Manifest enabling Android TV and Mini PC standalone installation.
 */

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crown Canvas Signage Player",
    short_name: "Crown Canvas",
    description:
      "Crown Paints East Africa enterprise digital signage CMS & offline-first showroom player.",
    start_url: "/player",
    display: "standalone",
    background_color: "#090d16",
    theme_color: "#0f172a",
    orientation: "landscape",
  };
}
