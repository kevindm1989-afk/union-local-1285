import bcrypt from "bcryptjs";
import { db, usersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Local1285!";
const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME ?? "Administrator";

export async function ensureSessionTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "sessions" (
        "sid" VARCHAR NOT NULL COLLATE "default",
        "sess" JSON NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL,
        CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON "sessions" ("expire");
    `);
  } finally {
    client.release();
  }
}

export async function seedAdminUser(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, ADMIN_USERNAME))
      .limit(1);

    if (existing) return;

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await db.insert(usersTable).values({
      username: ADMIN_USERNAME,
      passwordHash,
      displayName: ADMIN_DISPLAY_NAME,
      role: "admin",
      isActive: true,
    });

    logger.info(
      { username: ADMIN_USERNAME },
      "Admin user seeded — change the password immediately via ADMIN_PASSWORD env var"
    );
  } catch (err) {
    logger.error({ err }, "seedAdminUser failed");
    throw err;
  }
}
