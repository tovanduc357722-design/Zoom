import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: resolve(__dirname, "../../../.env"), quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
