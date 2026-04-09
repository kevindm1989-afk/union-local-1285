import { Router } from "express";
import { db, localSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

const ALLOWED_KEYS = [
  "admin_email",
  "portal_url",
  "grievance_deadline_step_1",
  "grievance_deadline_step_2",
  "grievance_deadline_step_3",
  "grievance_deadline_step_4",
  "grievance_deadline_step_5",
  "cba_expiry_date",
  "cba_name",
] as const;

router.get("/", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(localSettingsTable);
  const map: Record<string, { value: string; description: string | null }> = {};
  for (const row of rows) {
    map[row.key] = { value: row.value, description: row.description ?? null };
  }
  res.json(map);
}));

router.patch("/", asyncHandler(async (req, res) => {
  const updates = req.body as Record<string, string>;
  if (typeof updates !== "object" || Array.isArray(updates)) {
    res.status(400).json({ error: "Body must be an object of key→value strings" });
    return;
  }

  const results: Record<string, string> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) {
      continue; // silently skip unknown keys
    }
    if (typeof value !== "string") continue;

    const [existing] = await db
      .select()
      .from(localSettingsTable)
      .where(eq(localSettingsTable.key, key));

    if (existing) {
      await db
        .update(localSettingsTable)
        .set({ value, updatedAt: new Date() })
        .where(eq(localSettingsTable.key, key));
    } else {
      await db.insert(localSettingsTable).values({ key, value, description: null });
    }

    results[key] = value;
  }

  res.json({ updated: results });
}));

export default router;
