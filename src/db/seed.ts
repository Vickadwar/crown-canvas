/**
 * @file src/db/seed.ts
 * @description CLI entrypoint for seeding Crown Paints East Africa reference data (`npm run db:seed`).
 */

import "./load-env";
import { runDatabaseSeed } from "./seed-runner";

runDatabaseSeed()
  .then((summary) => {
    console.log("Seed completed successfully:", summary);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
