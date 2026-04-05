import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.PG_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "PG_URL must be set. Add your external PostgreSQL connection string as a secret.",
  );
}

const isNeon = connectionString.includes("neon.tech");
const isSupabase = connectionString.includes("supabase.com");

export const pool = new Pool({
  connectionString,
  ssl: (isNeon || isSupabase) ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
