/**
 * @file scripts/migrate-public-to-r2.ts
 * @description One-shot cleanup & migration tool that:
 *   1. Deduplicates `showcase_products` in Postgres (e.g. 34 -> 17 unique items).
 *   2. Uploads `public/media/products/*` to Cloudflare R2 (`products/<file>`) with 1-year
 *      immutable `Cache-Control`, verifies via HTTP 200 HEAD, and updates `showcase_products`
 *      (`image_url` + `storage_path`) and any `quick_posts` references.
 *   3. Uploads `public/media/banners/*` to Cloudflare R2 (`banners/<file>`) with 1-year
 *      immutable `Cache-Control`, verifies via HTTP 200 HEAD, registers them in
 *      `studio_backgrounds` (idempotently, zero duplicates), and rewrites `quick_posts` references.
 *   4. When `--clean-public` is passed and all uploads are verified, deletes
 *      `public/media/products/`, `public/media/banners/`, and unused Next.js starter SVGs
 *      while keeping `public/sw.js`, `public/pdf.worker.min.mjs`, `public/fonts/`, and
 *      `public/media/logo/CrownLogo.png` intact.
 *
 * Usage:
 *   npm run storage:migrate-public-to-r2 -- --clean-public
 */

import fs from "node:fs";
import path from "node:path";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import postgres from "postgres";
import { CROWN_CAMPAIGN_BANNERS } from "../src/lib/crown-products";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

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

function guessContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function main() {
  loadEnvLocal();

  const args = new Set(process.argv.slice(2));
  const cleanPublic = args.has("--clean-public");

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

  if (
    !dbUrl ||
    !endpoint ||
    !accessKeyId ||
    !secretAccessKey ||
    !r2Bucket ||
    !r2PublicBase
  ) {
    console.error("Missing required DB or R2 environment variables in .env.local.");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { max: 1 });
  const r2 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const publicDir = path.resolve(process.cwd(), "public");
  const productsDir = path.join(publicDir, "media", "products");
  const bannersDir = path.join(publicDir, "media", "banners");

  async function uploadPublicFileToR2(
    localFilePath: string,
    r2Key: string
  ): Promise<{ publicUrl: string; storagePath: string }> {
    let existsInR2 = false;
    try {
      await r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: r2Key }));
      existsInR2 = true;
    } catch {
      existsInR2 = false;
    }

    if (!existsInR2) {
      const body = fs.readFileSync(localFilePath);
      const contentType = guessContentType(localFilePath);
      await r2.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: r2Key,
          Body: body,
          ContentType: contentType,
          CacheControl: IMMUTABLE_CACHE_CONTROL,
        })
      );
      console.log(
        `  [UPLOADED] ${r2Key} (${(body.byteLength / 1024).toFixed(0)} KB)`
      );
    } else {
      console.log(`  [EXISTS]   ${r2Key} already in R2`);
    }

    const publicUrl = `${r2PublicBase}/${r2Key}`;
    const head = await fetch(publicUrl, { method: "HEAD" });
    if (!head.ok) {
      throw new Error(
        `Verification HEAD failed (${head.status}) for ${publicUrl}`
      );
    }
    return { publicUrl, storagePath: r2Key };
  }

  const pathRewriteMap = new Map<string, { publicUrl: string; storagePath: string }>();

  try {
    console.log("\n=== 1. Deduplicating showcase_products in Postgres ===");
    const allProducts = await sql<
      Array<{
        id: string;
        name: string;
        image_url: string;
        storage_path: string | null;
        sort_order: number;
        created_at: Date;
      }>
    >`SELECT id, name, image_url, storage_path, sort_order, created_at FROM showcase_products ORDER BY sort_order ASC, created_at ASC`;

    const seenNames = new Map<string, string>();
    const duplicateIds: string[] = [];
    for (const row of allProducts) {
      const key = row.name.trim().toLowerCase();
      if (seenNames.has(key)) {
        duplicateIds.push(row.id);
      } else {
        seenNames.set(key, row.id);
      }
    }

    if (duplicateIds.length > 0) {
      await sql`DELETE FROM showcase_products WHERE id = ANY(${duplicateIds}::uuid[])`;
      console.log(
        `  [DEDUP] Removed ${duplicateIds.length} duplicate showcase_products rows (${allProducts.length} -> ${allProducts.length - duplicateIds.length}).`
      );
    } else {
      console.log(`  [OK] No duplicate showcase_products found (${allProducts.length} total).`);
    }

    console.log("\n=== 2. Migrating public/media/products/* to Cloudflare R2 ===");
    if (fs.existsSync(productsDir)) {
      const files = fs.readdirSync(productsDir).filter((f) => !f.startsWith("."));
      for (const fileName of files) {
        const localPath = path.join(productsDir, fileName);
        if (!fs.statSync(localPath).isFile()) continue;
        const r2Key = `products/${fileName}`;
        const uploaded = await uploadPublicFileToR2(localPath, r2Key);
        const oldPath = `/media/products/${fileName}`;
        pathRewriteMap.set(oldPath, uploaded);

        const updated = await sql`
          UPDATE showcase_products
          SET image_url = ${uploaded.publicUrl},
              storage_path = ${uploaded.storagePath},
              updated_at = NOW()
          WHERE image_url = ${oldPath}
          RETURNING id
        `;
        if (updated.length > 0) {
          console.log(`    ↳ Updated ${updated.length} showcase_products row(s)`);
        }
      }
    } else {
      console.log("  [SKIP] public/media/products does not exist.");
    }

    console.log("\n=== 3. Migrating public/media/banners/* to Cloudflare R2 & studio_backgrounds ===");
    const existingBgs = await sql<
      Array<{ id: string; name: string; image_url: string; storage_path: string | null }>
    >`SELECT id, name, image_url, storage_path FROM studio_backgrounds`;

    if (fs.existsSync(bannersDir)) {
      const files = fs.readdirSync(bannersDir).filter((f) => !f.startsWith("."));
      for (const fileName of files) {
        const localPath = path.join(bannersDir, fileName);
        if (!fs.statSync(localPath).isFile()) continue;
        const r2Key = `banners/${fileName}`;
        const uploaded = await uploadPublicFileToR2(localPath, r2Key);
        const oldPath = `/media/banners/${fileName}`;
        pathRewriteMap.set(oldPath, uploaded);

        const meta = CROWN_CAMPAIGN_BANNERS.find((b) => b.imageUrl === oldPath);
        const displayName =
          meta?.name ??
          fileName
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
        const category = meta?.category ?? "Campaign";

        const alreadyExists = existingBgs.find(
          (bg) =>
            bg.storage_path === uploaded.storagePath ||
            bg.image_url === uploaded.publicUrl ||
            bg.name.trim().toLowerCase() === displayName.trim().toLowerCase()
        );

        if (!alreadyExists) {
          await sql`
            INSERT INTO studio_backgrounds (name, category, image_url, storage_path)
            VALUES (${displayName}, ${category}, ${uploaded.publicUrl}, ${uploaded.storagePath})
          `;
          console.log(`    ↳ Added "${displayName}" to studio_backgrounds`);
        } else {
          await sql`
            UPDATE studio_backgrounds
            SET image_url = ${uploaded.publicUrl},
                storage_path = ${uploaded.storagePath}
            WHERE id = ${alreadyExists.id}
          `;
          console.log(`    ↳ Updated existing "${displayName}" in studio_backgrounds`);
        }
      }
    } else {
      console.log("  [SKIP] public/media/banners does not exist.");
    }

    console.log("\n=== 4. Rewriting any quick_posts referencing /media/products/ or /media/banners/ ===");
    const qpRows = await sql<
      Array<{ id: string; slide_config: Record<string, unknown> }>
    >`SELECT id, slide_config FROM quick_posts WHERE slide_config::text LIKE '%/media/products/%' OR slide_config::text LIKE '%/media/banners/%'`;
    let qpUpdated = 0;
    for (const row of qpRows) {
      let jsonStr = JSON.stringify(row.slide_config);
      let changed = false;
      for (const [oldPath, { publicUrl }] of pathRewriteMap.entries()) {
        if (jsonStr.includes(oldPath)) {
          jsonStr = jsonStr.split(oldPath).join(publicUrl);
          changed = true;
        }
      }
      if (changed) {
        const nextCfg = JSON.parse(jsonStr);
        await sql`UPDATE quick_posts SET slide_config = ${sql.json(nextCfg)}, updated_at = NOW() WHERE id = ${row.id}`;
        qpUpdated++;
      }
    }
    console.log(`  [OK] Rewrote ${qpUpdated} quick_posts slide(s).`);

    if (cleanPublic) {
      console.log("\n=== 5. Cleaning migrated static files & unused starter SVGs from public/ ===");
      if (fs.existsSync(productsDir)) {
        fs.rmSync(productsDir, { recursive: true, force: true });
        console.log("  [REMOVED] public/media/products/");
      }
      if (fs.existsSync(bannersDir)) {
        fs.rmSync(bannersDir, { recursive: true, force: true });
        console.log("  [REMOVED] public/media/banners/");
      }
      for (const svg of [
        "file.svg",
        "globe.svg",
        "next.svg",
        "vercel.svg",
        "window.svg",
      ]) {
        const target = path.join(publicDir, svg);
        if (fs.existsSync(target)) {
          fs.unlinkSync(target);
          console.log(`  [REMOVED] public/${svg}`);
        }
      }
      console.log(
        "  [KEPT]    public/sw.js, public/pdf.worker.min.mjs, public/fonts/, public/media/logo/CrownLogo.png"
      );
    }

    console.log("\n=== Complete! ===\n");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[ERROR] Public-to-R2 migration failed:", err);
  process.exit(1);
});
