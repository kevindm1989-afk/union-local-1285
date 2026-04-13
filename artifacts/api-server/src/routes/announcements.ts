import { Router } from "express";
import { z } from "zod/v4";
import { db, announcementsTable, pool, usersTable } from "@workspace/db";
import { requirePermission, requireSteward } from "../lib/permissions";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { notifyUrgentBulletin } from "../lib/notifications";
import {
  CreateAnnouncementBody,
  ListAnnouncementsQueryParams,
  GetAnnouncementParams,
  UpdateAnnouncementParams,
  DeleteAnnouncementParams,
} from "@workspace/api-zod";
import { asyncHandler } from "../lib/asyncHandler";
import { sendPushToUsers } from "./push";
import { logger } from "../lib/logger";

const ANNOUNCEMENT_CATEGORIES = [
  "general", "urgent", "contract", "meeting", "action",
  "safety_alert", "strike_action",
  "job_action", "vote_notice", "policy_change",
] as const;
const URGENCY_LEVELS = ["normal", "high", "critical"] as const;
const MOBILIZATION_CATEGORIES = new Set(["job_action", "strike_action", "action"]);

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  category: z.string().optional(),
  isUrgent: z.boolean().optional(),
  urgencyLevel: z.enum(URGENCY_LEVELS).optional(),
  scheduledFor: z.string().optional(),
  expiresAt: z.string().optional(),
});

const router = Router();

function formatAnnouncement(a: typeof announcementsTable.$inferSelect & {
  scheduled_for?: Date | null;
  is_published?: boolean | null;
  expires_at?: Date | null;
}) {
  const raw = a as any;
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    category: a.category,
    isUrgent: a.isUrgent,
    urgencyLevel: a.urgencyLevel ?? "normal",
    publishedAt: a.publishedAt.toISOString(),
    scheduledFor: raw.scheduled_for ? new Date(raw.scheduled_for).toISOString() : null,
    isPublished: raw.is_published !== false,
    expiresAt: raw.expires_at ? new Date(raw.expires_at).toISOString() : null,
    isMobilization: MOBILIZATION_CATEGORIES.has(a.category),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// ─── GET / ─── active feed (is_published=true, not expired) + optional ?view=scheduled|archived
router.get("/", asyncHandler(async (req, res) => {
  const parsed = ListAnnouncementsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const view = (req.query as any).view as string | undefined;
  const { category } = parsed.data;

  let whereClause: string;
  if (view === "scheduled") {
    whereClause = `is_published = FALSE AND scheduled_for IS NOT NULL`;
  } else if (view === "archived") {
    whereClause = `expires_at IS NOT NULL AND expires_at <= NOW()`;
  } else {
    whereClause = `is_published = TRUE AND (expires_at IS NULL OR expires_at > NOW())`;
  }

  const client = await pool.connect();
  try {
    const catFilter = category ? ` AND category = '${category.replace(/'/g, "''")}'` : "";
    const result = await client.query(
      `SELECT * FROM announcements WHERE ${whereClause}${catFilter} ORDER BY published_at DESC LIMIT 200`
    );
    const rows = result.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      category: r.category,
      isUrgent: r.is_urgent,
      urgencyLevel: r.urgency_level ?? "normal",
      publishedAt: r.published_at?.toISOString() ?? new Date().toISOString(),
      scheduledFor: r.scheduled_for ? new Date(r.scheduled_for).toISOString() : null,
      isPublished: r.is_published !== false,
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      isMobilization: MOBILIZATION_CATEGORIES.has(r.category),
      createdAt: r.created_at?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updated_at?.toISOString() ?? new Date().toISOString(),
    }));
    res.json(rows);
  } finally {
    client.release();
  }
}));

// ─── POST / ─── create bulletin (optionally scheduled)
router.post("/", requirePermission("bulletins.post"), asyncHandler(async (req, res) => {
  // Validate using the generated schema but strip category first (it has a narrower enum)
  const { category: rawCategory, ...bodyWithoutCategory } = req.body as Record<string, unknown>;
  const parsed = CreateAnnouncementBody.safeParse({ ...bodyWithoutCategory, category: "general" });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const d = parsed.data;
  const extra = req.body as Record<string, unknown>;
  const category = (
    ANNOUNCEMENT_CATEGORIES.includes(rawCategory as typeof ANNOUNCEMENT_CATEGORIES[number])
      ? rawCategory
      : "general"
  ) as string;
  const isUrgent = d.isUrgent ?? (["urgent", "safety_alert", "strike_action", "job_action"].includes(category));
  const urgencyLevel = (extra.urgencyLevel as string)
    ?? (["strike_action", "safety_alert", "job_action"].includes(category) ? "critical" : isUrgent ? "high" : "normal");

  const scheduledFor = extra.scheduledFor ? new Date(extra.scheduledFor as string) : null;
  const expiresAt = extra.expiresAt ? new Date(extra.expiresAt as string) : null;
  const isPublished = !scheduledFor || scheduledFor <= new Date();

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO announcements
        (title, content, category, is_urgent, urgency_level, is_published, scheduled_for, expires_at, published_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $6 THEN NOW() ELSE $7 END, NOW(), NOW())
       RETURNING *`,
      [d.title, d.content, category, isUrgent, urgencyLevel, isPublished, scheduledFor, expiresAt]
    );
    const row = result.rows[0];
    const formatted = {
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      isUrgent: row.is_urgent,
      urgencyLevel: row.urgency_level ?? "normal",
      publishedAt: row.published_at?.toISOString() ?? new Date().toISOString(),
      scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString() : null,
      isPublished: row.is_published !== false,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      isMobilization: MOBILIZATION_CATEGORIES.has(row.category),
      createdAt: row.created_at?.toISOString() ?? new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() ?? new Date().toISOString(),
    };

    if (isPublished && (isUrgent || urgencyLevel === "critical" || urgencyLevel === "high")) {
      notifyUrgentBulletin({ id: row.id, title: row.title, content: row.content }).catch(() => {});
    }

    res.status(201).json(formatted);
  } finally {
    client.release();
  }
}));

// ─── GET /:id ─── single bulletin
router.get("/:id", asyncHandler(async (req, res) => {
  const parsed = GetAnnouncementParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT * FROM announcements WHERE id = $1 LIMIT 1`, [parsed.data.id]);
    if (!result.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const r = result.rows[0];
    res.json({
      id: r.id, title: r.title, content: r.content, category: r.category,
      isUrgent: r.is_urgent, urgencyLevel: r.urgency_level ?? "normal",
      publishedAt: r.published_at?.toISOString() ?? new Date().toISOString(),
      scheduledFor: r.scheduled_for ? new Date(r.scheduled_for).toISOString() : null,
      isPublished: r.is_published !== false,
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      isMobilization: MOBILIZATION_CATEGORIES.has(r.category),
      createdAt: r.created_at?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updated_at?.toISOString() ?? new Date().toISOString(),
    });
  } finally {
    client.release();
  }
}));

// ─── PATCH /:id ─── update bulletin
router.patch("/:id", requirePermission("bulletins.manage"), asyncHandler(async (req, res) => {
  const paramParsed = UpdateAnnouncementParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  const bodyParsed = updateAnnouncementSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(422).json({ error: bodyParsed.error.message, code: "VALIDATION_ERROR" });
    return;
  }

  const d = bodyParsed.data;
  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  let idx = 1;

  if (d.title !== undefined) { sets.push(`title = $${idx++}`); vals.push(d.title); }
  if (d.content !== undefined) { sets.push(`content = $${idx++}`); vals.push(d.content); }
  if (d.category !== undefined) { sets.push(`category = $${idx++}`); vals.push(d.category); }
  if (d.isUrgent !== undefined) { sets.push(`is_urgent = $${idx++}`); vals.push(d.isUrgent); }
  if (d.urgencyLevel !== undefined) { sets.push(`urgency_level = $${idx++}`); vals.push(d.urgencyLevel); }
  if (d.scheduledFor !== undefined) {
    const sf = d.scheduledFor ? new Date(d.scheduledFor) : null;
    sets.push(`scheduled_for = $${idx++}`); vals.push(sf);
    if (sf && sf > new Date()) {
      sets.push(`is_published = FALSE`);
    } else {
      sets.push(`is_published = TRUE`);
    }
  }
  if (d.expiresAt !== undefined) {
    sets.push(`expires_at = $${idx++}`); vals.push(d.expiresAt ? new Date(d.expiresAt) : null);
  }

  vals.push(paramParsed.data.id);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE announcements SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!result.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const r = result.rows[0];
    res.json({
      id: r.id, title: r.title, content: r.content, category: r.category,
      isUrgent: r.is_urgent, urgencyLevel: r.urgency_level ?? "normal",
      publishedAt: r.published_at?.toISOString() ?? new Date().toISOString(),
      scheduledFor: r.scheduled_for ? new Date(r.scheduled_for).toISOString() : null,
      isPublished: r.is_published !== false,
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      isMobilization: MOBILIZATION_CATEGORIES.has(r.category),
      createdAt: r.created_at?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updated_at?.toISOString() ?? new Date().toISOString(),
    });
  } finally {
    client.release();
  }
}));

// ─── DELETE /:id ─── delete bulletin
router.delete("/:id", requirePermission("bulletins.manage"), asyncHandler(async (req, res) => {
  const parsed = DeleteAnnouncementParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(announcementsTable).where(eq(announcementsTable.id, parsed.data.id));
  res.status(204).end();
}));

// ─── POST /:id/acknowledge ─── member acknowledges a bulletin
router.post("/:id/acknowledge", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  // Use linkedMemberId if available, otherwise use userId as the member identifier
  const memberId = req.session?.linkedMemberId ?? req.session?.userId ?? null;
  if (!memberId) { res.status(403).json({ error: "No member account linked to this session" }); return; }

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO bulletin_acknowledgements (announcement_id, member_id, acknowledged_at)
       VALUES ($1, $2, NOW()) ON CONFLICT (announcement_id, member_id) DO NOTHING`,
      [id, memberId]
    );
    res.json({ ok: true, announcementId: id, memberId });
  } finally {
    client.release();
  }
}));

// ─── GET /:id/acknowledgements ─── steward: see ack rate + member list
router.get("/:id/acknowledgements", requireSteward, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const client = await pool.connect();
  try {
    // Total active members
    const totalResult = await client.query(`SELECT COUNT(*) FROM members WHERE is_active = TRUE`);
    const totalMembers = parseInt(totalResult.rows[0].count, 10) || 0;

    // Acknowledged members
    const ackResult = await client.query(
      `SELECT ba.member_id, m.name, m.department, m.shift, ba.acknowledged_at
       FROM bulletin_acknowledgements ba
       JOIN members m ON m.id = ba.member_id
       WHERE ba.announcement_id = $1
       ORDER BY ba.acknowledged_at DESC`,
      [id]
    );
    const acknowledged = ackResult.rows.map((r: any) => ({
      memberId: r.member_id, name: r.name, department: r.department,
      shift: r.shift, acknowledgedAt: r.acknowledged_at?.toISOString(),
    }));

    // Unacknowledged members
    const unackResult = await client.query(
      `SELECT m.id, m.name, m.department, m.shift
       FROM members m
       WHERE m.is_active = TRUE
         AND m.id NOT IN (
           SELECT member_id FROM bulletin_acknowledgements WHERE announcement_id = $1
         )
       ORDER BY m.name`,
      [id]
    );
    const unacknowledged = unackResult.rows.map((r: any) => ({
      memberId: r.id, name: r.name, department: r.department, shift: r.shift,
    }));

    res.json({
      announcementId: id,
      totalMembers,
      acknowledgedCount: acknowledged.length,
      acknowledgedRate: totalMembers > 0 ? Math.round((acknowledged.length / totalMembers) * 100) : 0,
      acknowledged,
      unacknowledged,
    });
  } finally {
    client.release();
  }
}));

// ─── POST /:id/notify-unacknowledged ─── steward: push to unacknowledged members
router.post("/:id/notify-unacknowledged", requireSteward, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const client = await pool.connect();
  try {
    // Get bulletin details for notification text
    const bullResult = await client.query(`SELECT title, content FROM announcements WHERE id = $1 LIMIT 1`, [id]);
    if (!bullResult.rows.length) { res.status(404).json({ error: "Bulletin not found" }); return; }
    const { title, content } = bullResult.rows[0];

    // Get user_ids of unacknowledged members
    const result = await client.query(
      `SELECT u.id AS user_id
       FROM members m
       JOIN users u ON u.linked_member_id = m.id
       WHERE m.is_active = TRUE
         AND m.id NOT IN (
           SELECT member_id FROM bulletin_acknowledgements WHERE announcement_id = $1
         )`,
      [id]
    );
    const userIds = result.rows.map((r: any) => r.user_id as number).filter(Boolean);

    if (userIds.length) {
      sendPushToUsers(userIds, {
        title: `⚠️ Action Required: ${title}`,
        body: `Please acknowledge: ${content.slice(0, 100)}…`,
        tag: `bulletin-followup-${id}`,
        url: `/bulletins/${id}`,
      }).catch(() => {});
    }

    res.json({ ok: true, notifiedCount: userIds.length });
  } finally {
    client.release();
  }
}));

// ─── POST /:id/respond ─── member mobilization response (im_in | need_info)
router.post("/:id/respond", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const memberId = req.session?.linkedMemberId ?? req.session?.userId ?? null;
  if (!memberId) { res.status(403).json({ error: "No member account linked" }); return; }

  const { response } = req.body ?? {};
  if (!["im_in", "need_info"].includes(response)) {
    res.status(400).json({ error: "response must be 'im_in' or 'need_info'" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO bulletin_responses (announcement_id, member_id, response, responded_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (announcement_id, member_id) DO UPDATE SET response = $3, responded_at = NOW()`,
      [id, memberId, response]
    );
    res.json({ ok: true, announcementId: id, memberId, response });
  } finally {
    client.release();
  }
}));

// ─── GET /:id/responses ─── steward: see mobilization response counts + members
router.get("/:id/responses", requireSteward, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT br.member_id, br.response, br.responded_at, m.name, m.department, m.shift
       FROM bulletin_responses br
       JOIN members m ON m.id = br.member_id
       WHERE br.announcement_id = $1
       ORDER BY br.responded_at DESC`,
      [id]
    );
    const responses = result.rows.map((r: any) => ({
      memberId: r.member_id, response: r.response, name: r.name,
      department: r.department, shift: r.shift,
      respondedAt: r.responded_at?.toISOString(),
    }));
    const imIn = responses.filter((r) => r.response === "im_in");
    const needInfo = responses.filter((r) => r.response === "need_info");

    res.json({ announcementId: id, totalResponses: responses.length, imIn, needInfo, responses });
  } finally {
    client.release();
  }
}));

// ─── Scheduler: auto-publish scheduled bulletins ────────────────────────────
export async function runScheduledBulletinJob() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE announcements
       SET is_published = TRUE, published_at = NOW(), updated_at = NOW()
       WHERE is_published = FALSE AND scheduled_for IS NOT NULL AND scheduled_for <= NOW()
       RETURNING id, title, content, is_urgent, urgency_level`
    );
    for (const row of result.rows) {
      logger.info({ id: row.id, title: row.title }, "Scheduled bulletin auto-published");
      if (row.is_urgent || row.urgency_level === "critical" || row.urgency_level === "high") {
        notifyUrgentBulletin({ id: row.id, title: row.title, content: row.content }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, "runScheduledBulletinJob error");
  } finally {
    client.release();
  }
}

export default router;
