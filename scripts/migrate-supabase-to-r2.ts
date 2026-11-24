/**
 * @file scripts/migrate-supabase-to-r2.ts
 * @description Idempotent zero-downtime migration tool that copies all existing
 * Supabase Storage media objects (`media_assets`, `showcase_products`, `studio_backgrounds`,
 * and `quick_posts` canvas images/backgrounds) into Cloudflare R2 with 1-year immutable
 * `Cache-Control`, verifies each new R2 URL, rewrites Postgres URLs, and optionally purges
 * migrated copies from Supabase Storage (`--purge-supabase`).
 *
 * Usage:
 *   npm run storage:migrate-r2 -- --dry-run
 *   npm run storage:migrate-r2
 *   npm run storage:migrate-r2 -- --purge-supabase
 */

import fs from "node:fs";
import path from "node:path";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const SUPABASE_PUBLIC_REGEX =
  /https?:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i;

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1).trim();
    const unquoted = rawVal.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (!process.env[key]) {
      process.env[key] = unquoted;
    }
  }
}

function parseSupabaseStorageUrl(
  url: string
): { bucket: string; objectPath: string } | null {
  const match = url.match(SUPABASE_PUBLIC_REGEX);
  if (!match) return null;
  const bucket = match[1];
  const rawPath = match[2].split("?")[0];
  return {
    bucket,
    objectPath: decodeURIComponent(rawPath).replace(/^\/+/, ""),
  };
}

async function main() {
  loadEnvLocal();

  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const purgeSupabase = args.has("--purge-supabase");

  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const endpoint = (
    process.env.S3_API?.trim() ||
    (process.env.R2_ACCOUNT_ID?.trim()
      ? `https://${process.env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`
      : "")
  ).replace(/\/+$/, "");
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const r2Bucket = process.env.R2_BUCKET_NAME?.trim();
  const r2PublicBase = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");

  if (!dbUrl || !endpoint || !accessKeyId || !secretAccessKey || !r2Bucket || !r2PublicBase) {
    console.error(
      "Missing required env vars in .env.local (DATABASE_URL/DIRECT_URL, S3_API/R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL)."
    );
    process.exit(1);
  }

  console.log(
    `\n=== Crown Canvas Supabase → Cloudflare R2 Migration ${dryRun ? "(DRY RUN)" : ""} ===`
  );
  console.log(`Target R2 Bucket : ${r2Bucket}`);
  console.log(`Public Base URL  : ${r2PublicBase}`);
  console.log(`Purge Supabase   : ${purgeSupabase ? "YES (after R2 verification)" : "NO (safe copy only)"}\n`);

  const sql = postgres(dbUrl, { max: 1 });
  const r2 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const supabaseAdmin =
    purgeSupabase &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
      : null;

  const migratedUrls = new Map<string, string>();
  const objectsToPurge = new Map<string, Set<string>>();

  async function migrateUrl(
    sourceUrl: string,
    hintMimeType?: string | null
  ): Promise<string | null> {
    if (migratedUrls.has(sourceUrl)) {
      return migratedUrls.get(sourceUrl)!;
    }

    const parsed = parseSupabaseStorageUrl(sourceUrl);
    if (!parsed) return null;

    const r2Key = parsed.objectPath;
    const targetUrl = `${r2PublicBase}/${r2Key}`;

    if (dryRun) {
      console.log(`  [DRY RUN] ${parsed.bucket}/${r2Key}  →  ${targetUrl}`);
      migratedUrls.set(sourceUrl, targetUrl);
      return targetUrl;
    }

    // Check if object already exists in R2 (idempotent re-runs!)
    let existsInR2 = false;
    try {
      await r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: r2Key }));
      existsInR2 = true;
    } catch {
      existsInR2 = false;
    }

    if (!existsInR2) {
      const res = await fetch(sourceUrl);
      if (!res.ok) {
        console.warn(`  [SKIP] HTTP ${res.status} downloading ${sourceUrl}`);
        return null;
      }
      const contentType =
        hintMimeType ||
        res.headers.get("content-type") ||
        "application/octet-stream";
      const arrayBuf = await res.arrayBuffer();
      const body = new Uint8Array(arrayBuf);

      await r2.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: r2Key,
          Body: body,
          ContentType: contentType,
          CacheControl: IMMUTABLE_CACHE_CONTROL,
        })
      );
      const sizeMb = (body.byteLength / (1024 * 1024)).toFixed(2);
      console.log(`  [COPIED] ${r2Key} (${sizeMb} MB, ${contentType})`);
    } else {
      console.log(`  [EXISTS] ${r2Key} already in R2 — reusing`);
    }

    // Verify new R2 public URL is reachable
    const verifyRes = await fetch(targetUrl, { method: "HEAD" });
    if (!verifyRes.ok) {
      console.error(
        `  [VERIFY FAILED] ${targetUrl} returned HTTP ${verifyRes.status}. Skipping DB rewrite for safety.`
      );
      return null;
    }

    migratedUrls.set(sourceUrl, targetUrl);
    if (purgeSupabase) {
      const set = objectsToPurge.get(parsed.bucket) ?? new Set<string>();
      set.add(parsed.objectPath);
      objectsToPurge.set(parsed.bucket, set);
    }
    return targetUrl;
  }

  let updatedMedia = 0;
  let updatedProducts = 0;
  let updatedBackgrounds = 0;
  let updatedQuickPosts = 0;

  try {
    // 1. media_assets
    const mediaRows = await sql<
      Array<{ id: string; title: string; public_url: string; mime_type: string | null }>
    >`SELECT id, title, public_url, mime_type FROM media_assets WHERE public_url LIKE '%supabase.%storage/v1/object/public/%'`;
    console.log(`Found ${mediaRows.length} media_assets on Supabase Storage.`);
    for (const row of mediaRows) {
      const nextUrl = await migrateUrl(row.public_url, row.mime_type);
      if (nextUrl && !dryRun) {
        await sql`UPDATE media_assets SET public_url = ${nextUrl}, updated_at = NOW() WHERE id = ${row.id}`;
        updatedMedia++;
      }
    }

    // 2. showcase_products
    const productRows = await sql<
      Array<{ id: string; name: string; image_url: string }>
    >`SELECT id, name, image_url FROM showcase_products WHERE image_url LIKE '%supabase.%storage/v1/object/public/%'`;
    console.log(`Found ${productRows.length} showcase_products on Supabase Storage.`);
    for (const row of productRows) {
      const nextUrl = await migrateUrl(row.image_url);
      if (nextUrl && !dryRun) {
        await sql`UPDATE showcase_products SET image_url = ${nextUrl}, updated_at = NOW() WHERE id = ${row.id}`;
        updatedProducts++;
      }
    }

    // 3. studio_backgrounds
    const bgRows = await sql<
      Array<{ id: string; name: string; image_url: string }>
    >`SELECT id, name, image_url FROM studio_backgrounds WHERE image_url LIKE '%supabase.%storage/v1/object/public/%'`;
    console.log(`Found ${bgRows.length} studio_backgrounds on Supabase Storage.`);
    for (const row of bgRows) {
      const nextUrl = await migrateUrl(row.image_url);
      if (nextUrl && !dryRun) {
        await sql`UPDATE studio_backgrounds SET image_url = ${nextUrl} WHERE id = ${row.id}`;
        updatedBackgrounds++;
      }
    }

    // 4. quick_posts (Studio canvas backgroundImageUrl & image element src)
    const qpRows = await sql<
      Array<{ id: string; title: string; slide_config: Record<string, unknown> }>
    >`SELECT id, title, slide_config FROM quick_posts WHERE slide_config::text LIKE '%supabase.%storage/v1/object/public/%'`;
    console.log(`Found ${qpRows.length} quick_posts referencing Supabase Storage.`);
    for (const row of qpRows) {
      const cfg = JSON.parse(JSON.stringify(row.slide_config)) as {
        canvasDoc?: {
          backgroundImageUrl?: string;
          elements?: Array<{ imageUrl?: string; src?: string }>;
        };
      };
      let changed = false;

      if (
        cfg.canvasDoc?.backgroundImageUrl &&
        SUPABASE_PUBLIC_REGEX.test(cfg.canvasDoc.backgroundImageUrl)
      ) {
        const nextUrl = await migrateUrl(cfg.canvasDoc.backgroundImageUrl);
        if (nextUrl) {
          cfg.canvasDoc.backgroundImageUrl = nextUrl;
          changed = true;
        }
      }
      if (Array.isArray(cfg.canvasDoc?.elements)) {
        for (const el of cfg.canvasDoc.elements) {
          if (el.imageUrl && SUPABASE_PUBLIC_REGEX.test(el.imageUrl)) {
            const nextUrl = await migrateUrl(el.imageUrl);
            if (nextUrl) {
              el.imageUrl = nextUrl;
              changed = true;
            }
          }
          if (el.src && SUPABASE_PUBLIC_REGEX.test(el.src)) {
            const nextUrl = await migrateUrl(el.src);
            if (nextUrl) {
              el.src = nextUrl;
              changed = true;
            }
          }
        }
      }

      if (changed && !dryRun) {
        await sql`UPDATE quick_posts SET slide_config = ${sql.json(cfg)}, updated_at = NOW() WHERE id = ${row.id}`;
        updatedQuickPosts++;
      }
    }

    // Optional Supabase Storage purge after verified migration
    if (purgeSupabase && !dryRun && supabaseAdmin) {
      for (const [bucket, paths] of objectsToPurge.entries()) {
        const list = Array.from(paths);
        if (list.length === 0) continue;
        const { error } = await supabaseAdmin.storage.from(bucket).remove(list);
        if (error) {
          console.error(`  [PURGE WARN] Could not purge ${bucket}:`, error.message);
        } else {
          console.log(
            `  [PURGED] Removed ${list.length} migrated file(s) from Supabase bucket "${bucket}".`
          );
        }
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Unique files processed : ${migratedUrls.size}`);
    if (!dryRun) {
      console.log(`media_assets updated   : ${updatedMedia}`);
      console.log(`showcase_products upd. : ${updatedProducts}`);
      console.log(`studio_backgrounds upd.: ${updatedBackgrounds}`);
      console.log(`quick_posts updated    : ${updatedQuickPosts}`);
    }
    console.log("Done.\n");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[ERROR] Migration failed:", err);
  process.exit(1);
});
