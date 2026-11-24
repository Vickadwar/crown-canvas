/**
 * @file scripts/setup-r2-cors.ts
 * @description Configures CORS rules on the Cloudflare R2 bucket so browser direct PUT
 * uploads (from CMS) and CORS video/image/PDF fetches + snapshots (from `/player`) succeed
 * cleanly without manual dashboard JSON editing.
 *
 * Run: npm run storage:setup-r2-cors
 */

import fs from "node:fs";
import path from "node:path";
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

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

async function main() {
  loadEnvLocal();

  const endpoint = (
    process.env.S3_API?.trim() ||
    (process.env.R2_ACCOUNT_ID?.trim()
      ? `https://${process.env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`
      : "")
  ).replace(/\/+$/, "");
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    console.error(
      "Missing R2 credentials. Ensure S3_API (or R2_ACCOUNT_ID), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are set in .env.local."
    );
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            ID: "crown-canvas-cms-and-player",
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    })
  );

  console.log(
    `[OK] Cloudflare R2 CORS rules applied successfully to bucket "${bucket}".`
  );
}

main().catch((err) => {
  console.error("[ERROR] Failed to configure R2 CORS:", err);
  process.exit(1);
});
