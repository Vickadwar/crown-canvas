import fs from "fs";
import path from "path";

/**
 * Loads `.env.local` (and `.env` fallback) for CLI scripts like `drizzle-kit` and `tsx`
 * which do not automatically read Next.js `.env.local` files.
 */
function parseAndApplyEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const root = process.cwd();
parseAndApplyEnvFile(path.join(root, ".env.local"));
parseAndApplyEnvFile(path.join(root, ".env"));
