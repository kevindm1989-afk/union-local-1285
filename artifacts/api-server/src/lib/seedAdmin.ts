import bcrypt from "bcryptjs";
import { db, usersTable, rolePermissionsTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
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
      ["cba_expiry_date", "", "CBA / Contract expiry date (ISO 8601 date string, e.g. 2027-03-31)"],
      ["cba_name", "Collective Bargaining Agreement", "Short name for the CBA"],
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

export async function ensureAccessRequestEnhancements(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE access_requests
        ADD COLUMN IF NOT EXISTS first_name TEXT,
        ADD COLUMN IF NOT EXISTS last_name TEXT,
        ADD COLUMN IF NOT EXISTS email TEXT,
        ADD COLUMN IF NOT EXISTS phone TEXT,
        ADD COLUMN IF NOT EXISTS employee_id TEXT,
        ADD COLUMN IF NOT EXISTS department TEXT,
        ADD COLUMN IF NOT EXISTS shift TEXT,
        ADD COLUMN IF NOT EXISTS message TEXT,
        ADD COLUMN IF NOT EXISTS requested_role TEXT,
        ADD COLUMN IF NOT EXISTS role_justification TEXT,
        ADD COLUMN IF NOT EXISTS approved_role TEXT,
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
        ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;
    `);
    // Also add last_login_at to users if not present
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    `);
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

export async function ensureAdvancedFeatureTables(): Promise<void> {
  const client = await pool.connect();
  try {
    // Case Journal
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_journal_entries (
        id SERIAL PRIMARY KEY,
        grievance_id INTEGER NOT NULL,
        author_id INTEGER NOT NULL,
        author_name TEXT,
        entry_type TEXT NOT NULL DEFAULT 'note',
        content TEXT NOT NULL,
        is_private BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_case_journal_grievance ON case_journal_entries (grievance_id);`);

    // Grievance Templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS grievance_templates (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        violation_type TEXT NOT NULL DEFAULT 'other',
        description_template TEXT NOT NULL,
        contract_article TEXT,
        default_step INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);

    // Just Cause Assessments
    await client.query(`
      CREATE TABLE IF NOT EXISTS just_cause_assessments (
        id SERIAL PRIMARY KEY,
        grievance_id INTEGER NOT NULL UNIQUE,
        assessed_by INTEGER NOT NULL,
        assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        adequate_notice BOOLEAN NOT NULL DEFAULT FALSE,
        reasonable_rule BOOLEAN NOT NULL DEFAULT FALSE,
        investigation_conducted BOOLEAN NOT NULL DEFAULT FALSE,
        investigation_fair BOOLEAN NOT NULL DEFAULT FALSE,
        proof_sufficient BOOLEAN NOT NULL DEFAULT FALSE,
        penalty_consistent BOOLEAN NOT NULL DEFAULT FALSE,
        penalty_progressive BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT
      );
    `);

    // Member Communication Log
    await client.query(`
      CREATE TABLE IF NOT EXISTS member_communication_log (
        id SERIAL PRIMARY KEY,
        grievance_id INTEGER NOT NULL,
        member_id INTEGER,
        logged_by INTEGER NOT NULL,
        logged_by_name TEXT,
        contact_method TEXT NOT NULL DEFAULT 'in_person',
        summary TEXT NOT NULL,
        contact_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_comm_log_grievance ON member_communication_log (grievance_id);`);

    // Discipline Records
    await client.query(`
      CREATE TABLE IF NOT EXISTS discipline_records (
        id SERIAL PRIMARY KEY,
        member_id INTEGER NOT NULL,
        discipline_type TEXT NOT NULL DEFAULT 'verbal_warning',
        incident_date DATE NOT NULL,
        issued_date DATE NOT NULL,
        description TEXT NOT NULL,
        response_filed BOOLEAN NOT NULL DEFAULT FALSE,
        grievance_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_discipline_member ON discipline_records (member_id);`);

    // Steward Coverage
    await client.query(`
      CREATE TABLE IF NOT EXISTS steward_coverage (
        id SERIAL PRIMARY KEY,
        steward_id INTEGER NOT NULL,
        department TEXT NOT NULL,
        shift TEXT NOT NULL DEFAULT 'days',
        area_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Polls
    await client.query(`
      CREATE TABLE IF NOT EXISTS polls (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        poll_type TEXT NOT NULL DEFAULT 'yes_no',
        options JSONB NOT NULL DEFAULT '[]',
        starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ends_at TIMESTAMPTZ NOT NULL,
        created_by INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        target_role TEXT NOT NULL DEFAULT 'all',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS poll_responses (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        response TEXT NOT NULL,
        responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (poll_id, user_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_poll_responses_poll ON poll_responses (poll_id);`);

    // Onboarding Checklists
    await client.query(`
      CREATE TABLE IF NOT EXISTS onboarding_checklists (
        id SERIAL PRIMARY KEY,
        member_id INTEGER NOT NULL UNIQUE,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        card_signed BOOLEAN NOT NULL DEFAULT FALSE,
        dues_explained BOOLEAN NOT NULL DEFAULT FALSE,
        cba_provided BOOLEAN NOT NULL DEFAULT FALSE,
        steward_introduced BOOLEAN NOT NULL DEFAULT FALSE,
        rights_explained BOOLEAN NOT NULL DEFAULT FALSE,
        benefits_explained BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMPTZ
      );
    `);

    // Arbitration Referral Packages
    await client.query(`
      CREATE TABLE IF NOT EXISTS arbitration_packages (
        id SERIAL PRIMARY KEY,
        grievance_id INTEGER NOT NULL,
        cover_summary TEXT NOT NULL,
        assembled_data JSONB NOT NULL DEFAULT '{}',
        generated_by INTEGER,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS arbitration_packages_grievance_id_key
      ON arbitration_packages (grievance_id);
    `);

    // Seed starter grievance templates if none exist
    const { rowCount } = await client.query(`SELECT 1 FROM grievance_templates LIMIT 1`);
    if (!rowCount) {
      const starters = [
        ["Unjust Discipline", "discipline", "Management has imposed discipline without just cause. The employee was issued [type of discipline] on [date] for alleged [reason]. The discipline is not supported by the facts and violates the collective agreement.", "Article 7 — Discipline", 1],
        ["Seniority Bypass", "seniority_bypass", "Management failed to follow seniority provisions when filling [position/overtime/shift]. Senior employee [name] was bypassed in favour of [junior employee] without a valid contractual reason.", "Article 14 — Seniority", 1],
        ["Scheduling Violation", "scheduling", "The Employer violated the scheduling provisions of the collective agreement when [describe the violation]. The schedule change/assignment was made without proper notice and contrary to established practice.", "Article 15 — Hours of Work", 1],
        ["Wage Discrepancy", "wages", "The Employer failed to properly compensate the employee for [work performed]. The employee is entitled to [rate/premium] pursuant to the collective agreement but was paid only [amount/rate paid].", "Article 18 — Wages and Classifications", 1],
        ["Harassment/Bullying", "harassment", "The employee has been subjected to workplace harassment and/or bullying by [management/co-worker] contrary to the collective agreement's harassment provisions. The conduct includes [describe].", "Article 9 — Non-Discrimination and Harassment", 1],
        ["Failure to Accommodate", "benefits", "The Employer has failed to accommodate the employee's [disability/medical/religious] needs to the point of undue hardship as required by the collective agreement and applicable human rights legislation.", "Article 9 — Non-Discrimination", 1],
      ];
      for (const [title, vtype, tmpl, article, step] of starters) {
        await client.query(
          `INSERT INTO grievance_templates (title, violation_type, description_template, contract_article, default_step) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [title, vtype, tmpl, article, step]
        );
      }
      logger.info("Grievance starter templates seeded");
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

    // Refuse to create/update the admin account without a known password.
    if (!process.env.ADMIN_PASSWORD) {
      console.error(
        "FATAL: ADMIN_PASSWORD environment variable is not set. " +
          "Refusing to seed admin account. " +
          "Set it via: fly secrets set ADMIN_PASSWORD=<value>  (production) " +
          "or add it to your local environment (development)."
      );
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);

    if (existing) {
      // Admin exists — always sync password and ensure account is active so
      // that rotating ADMIN_PASSWORD takes effect on next restart.
      await db
        .update(usersTable)
        .set({ passwordHash, isActive: true })
        .where(eq(usersTable.username, ADMIN_USERNAME));
      logger.info({ username: ADMIN_USERNAME }, "Admin credentials synced from ADMIN_PASSWORD env var");
      return;
    }

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
