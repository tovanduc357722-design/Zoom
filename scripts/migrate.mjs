import "dotenv/config";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(784237891)");
  await client.query(
    'CREATE TABLE IF NOT EXISTS "_healthconnect_migrations" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  for (const name of (await fs.readdir("prisma/migrations")).sort()) {
    if (!/^\d+_/.test(name)) continue;
    const sql = await fs.readFile(
      `prisma/migrations/${name}/migration.sql`,
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = await client.query(
      'SELECT checksum FROM "_healthconnect_migrations" WHERE name=$1',
      [name],
    );
    if (previous.rows.length) {
      if (previous.rows[0].checksum !== checksum)
        throw new Error(`Migration checksum mismatch: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO "_healthconnect_migrations" (name,checksum) VALUES ($1,$2)',
        [name, checksum],
      );
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("Migrations up to date.");
} finally {
  await client.end();
}
