import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
const url = new URL(process.env.DATABASE_URL);
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(784237892)");
  if (
    !(
      await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        "healthconnect_test",
      ])
    ).rowCount
  )
    await client.query("CREATE DATABASE healthconnect_test");
  url.pathname = "/healthconnect_test";
  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    SEED_DEMO: "true",
    NODE_ENV: "test",
  };
  for (const args of [
    ["scripts/migrate.mjs"],
    ["--import", "tsx", "prisma/seed.ts"],
    ["--import", "tsx", "--test", "--test-concurrency=1", "tests/core.test.ts"],
  ]) {
    const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
    if (result.status !== 0) {
      process.exitCode = result.status || 1;
      break;
    }
  }
} finally {
  await client.end();
}
