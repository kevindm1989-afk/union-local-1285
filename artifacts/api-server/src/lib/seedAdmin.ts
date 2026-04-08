import bcrypt from "bcryptjs";
import { db, usersTable, rolePermissionsTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Local1285!";
const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME ?? "Administrator";

export const ALL_PERMISSIONS = [
  "members.view",
  "members.edit",
  "grievances.view",
  "grievances.file",
  "grievances.manage",
  "bulletins.view",
  "bulletins.post",
  "bulletins.manage",
  "documents.view",
  "documents.upload",
  "meetings.view",
  "meetings.manage",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const STEWARD_DEFAULT: Permission[] = [
  "members.view",
  "members.edit",
  "grievances.view",
  "grievances.file",
  "bulletins.view",
  "bulletins.post",
  "documents.view",
  "meetings.view",
];

export async function ensureAuditLogTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        old_value JSONB,
        new_value JSONB,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id);
    `);
  } finally {
    client.release();
  }
}

export async function ensureLocalSettingsTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS local_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    // Seed default grievance deadlines (days) — only insert if not already present
    const defaults = [
      ["grievance_deadline_step_1", "5", "Days to respond at Step 1"],
      ["grievance_deadline_step_2", "10", "Days to respond at Step 2"],
      ["grievance_deadline_step_3", "15", "Days to respond at Step 3"],
      ["grievance_deadline_step_4", "20", "Days to respond at Step 4"],
      ["grievance_deadline_step_5", "30", "Days to respond at Arbitration (Step 5)"],
    ];
    for (const [key, value, description] of defaults) {
      await client.query(
        `INSERT INTO local_settings (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
        [key, value, description],
      );
    }
  } finally {
    client.release();
  }
}

export async function ensureGrievanceEnhancements(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE grievances
        ADD COLUMN IF NOT EXISTS accommodation_request BOOLEAN NOT NULL DEFAULT FALSE;
    `);
  } finally {
    client.release();
  }
}

export async function ensureMemberEnhancements(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE members
        ADD COLUMN IF NOT EXISTS seniority_date DATE,
        ADD COLUMN IF NOT EXISTS dues_status VARCHAR(20) DEFAULT 'current',
        ADD COLUMN IF NOT EXISTS dues_last_paid DATE,
        ADD COLUMN IF NOT EXISTS shift VARCHAR(20),
        ADD COLUMN IF NOT EXISTS classification_date DATE;
    `);
  } finally {
    client.release();
  }
}

export async function ensureMemberFilesTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS member_files (
        id SERIAL PRIMARY KEY,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        category VARCHAR(50) NOT NULL DEFAULT 'general',
        filename VARCHAR(255) NOT NULL,
        object_path VARCHAR(512) NOT NULL,
        content_type VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
        file_size INTEGER,
        description TEXT,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}

export async function ensureAiTables(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}

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

export async function ensureMemberPortalEnhancements(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE members
        ADD COLUMN IF NOT EXISTS signature_data TEXT,
        ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS engagement_level VARCHAR(20) DEFAULT 'unknown',
        ADD COLUMN IF NOT EXISTS shop_floor_leader BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS organizing_notes TEXT;
    `);
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS linked_member_id INTEGER;
    `);
    await client.query(`
      ALTER TABLE documents
        ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'cba',
        ADD COLUMN IF NOT EXISTS uploaded_by INTEGER;
    `);
  } finally {
    client.release();
  }
}

export async function ensureGrievanceNotesTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS grievance_notes (
        id SERIAL PRIMARY KEY,
        grievance_id INTEGER NOT NULL,
        user_id INTEGER,
        author_name TEXT,
        content TEXT NOT NULL,
        note_type TEXT NOT NULL DEFAULT 'note',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_grievance_notes_grievance ON grievance_notes (grievance_id);
    `);
  } finally {
    client.release();
  }
}

export async function ensureMeetingsTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT 'general',
        date TIMESTAMPTZ NOT NULL,
        location TEXT,
        agenda TEXT,
        minutes TEXT,
        minutes_published VARCHAR(10) NOT NULL DEFAULT 'draft',
        attendees JSONB NOT NULL DEFAULT '[]',
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings (date);
    `);
  } finally {
    client.release();
  }
}

export async function ensurePushSubscriptionsTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (user_id);
    `);
  } finally {
    client.release();
  }
}

export async function ensureNotificationPreferences(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE members
        ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await client.query(`
      ALTER TABLE members
        ADD COLUMN IF NOT EXISTS phone_cell TEXT;
    `);
  } finally {
    client.release();
  }
}

export async function ensureVapidKeys(): Promise<void> {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT value FROM local_settings WHERE key = 'vapid_public_key' LIMIT 1`
    );
    if (existing.rows.length === 0) {
      const webpush = await import("web-push");
      const keys = webpush.generateVAPIDKeys();
      await client.query(
        `INSERT INTO local_settings (key, value, description) VALUES
          ('vapid_public_key', $1, 'VAPID public key for Web Push'),
          ('vapid_private_key', $2, 'VAPID private key for Web Push')
        ON CONFLICT (key) DO NOTHING`,
        [keys.publicKey, keys.privateKey]
      );
      logger.info("VAPID keys generated and stored in local_settings");
    }
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

export async function seedDefaultPermissions(): Promise<void> {
  try {
    const chairRows = ALL_PERMISSIONS.map((p) => ({
      role: "chair",
      permission: p,
      granted: true,
    }));
    const stewardRows = ALL_PERMISSIONS.map((p) => ({
      role: "steward",
      permission: p,
      granted: STEWARD_DEFAULT.includes(p as Permission),
    }));

    for (const row of [...chairRows, ...stewardRows]) {
      await db.insert(rolePermissionsTable).values(row).onConflictDoNothing();
    }

    logger.info("Default role permissions seeded");
  } catch (err) {
    logger.error({ err }, "seedDefaultPermissions failed");
  }
}

export async function loadUserPermissions(role: string): Promise<string[]> {
  if (role === "admin") return [...ALL_PERMISSIONS];

  try {
    const rows = await db
      .select({ permission: rolePermissionsTable.permission, granted: rolePermissionsTable.granted })
      .from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.role, role));

    return rows.filter((r) => r.granted).map((r) => r.permission);
  } catch {
    return [];
  }
}
