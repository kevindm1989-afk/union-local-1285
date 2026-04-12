import { Router } from "express";
import { z } from "zod/v4";
import { db, announcementsTable } from "@workspace/db";
import { requirePermission } from "../lib/permissions";
import { eq, desc } from "drizzle-orm";
import { notifyUrgentBulletin } from "../lib/notifications";
import {
  CreateAnnouncementBody,
  ListAnnouncementsQueryParams,
  GetAnnouncementParams,
  UpdateAnnouncementParams,
  DeleteAnnouncementParams,
} from "@workspace/api-zod";
import { asyncHandler } from "../lib/asyncHandler";

const ANNOUNCEMENT_CATEGORIES = ["general", "urgent", "contract", "meeting", "action", "safety_alert", "strike_action"] as const;
const URGENCY_LEVELS = ["normal", "high", "critical"] as const;

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  isUrgent: z.boolean().optional(),
  urgencyLevel: z.enum(URGENCY_LEVELS).optional(),
});

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const parsed = ListAnnouncementsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { category } = parsed.data;
  const announcements = await db
    .select()
    .from(announcementsTable)
    .where(category ? eq(announcementsTable.category, category) : undefined)
    .orderBy(desc(announcementsTable.publishedAt));

  res.json(announcements.map(formatAnnouncement));
}));

router.post("/", requirePermission("bulletins.post"), asyncHandler(async (req, res) => {
  const parsed = CreateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const d = parsed.data;
  const category = (d.category as typeof ANNOUNCEMENT_CATEGORIES[number]) ?? "general";
  const isUrgent = d.isUrgent ?? (category === "urgent" || category === "safety_alert" || category === "strike_action");
  const urgencyLevel = (d as Record<string, unknown>).urgencyLevel as string
    ?? (category === "strike_action" || category === "safety_alert" ? "critical" : isUrgent ? "high" : "normal");

  const [announcement] = await db
    .insert(announcementsTable)
    .values({
      title: d.title,
      content: d.content,
      category,
      isUrgent,
      urgencyLevel,
    })
    .returning();

  if (announcement.isUrgent || announcement.urgencyLevel === "critical" || announcement.urgencyLevel === "high") {
    notifyUrgentBulletin({ id: announcement.id, title: announcement.title, content: announcement.content }).catch(() => {});
  }

  res.status(201).json(formatAnnouncement(announcement));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const parsed = GetAnnouncementParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [announcement] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.id, parsed.data.id));

  if (!announcement) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(formatAnnouncement(announcement));
}));

router.patch("/:id", requirePermission("bulletins.manage"), asyncHandler(async (req, res) => {
  const paramParsed = UpdateAnnouncementParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const bodyParsed = updateAnnouncementSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(422).json({ error: bodyParsed.error.message, code: "VALIDATION_ERROR" });
    return;
  }

  const d = bodyParsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.title !== undefined) updates.title = d.title;
  if (d.content !== undefined) updates.content = d.content;
  if (d.category !== undefined) updates.category = d.category;
  if (d.isUrgent !== undefined) updates.isUrgent = d.isUrgent;
  if (d.urgencyLevel !== undefined) updates.urgencyLevel = d.urgencyLevel;

  const [announcement] = await db
    .update(announcementsTable)
    .set(updates)
    .where(eq(announcementsTable.id, paramParsed.data.id))
    .returning();

  if (!announcement) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(formatAnnouncement(announcement));
}));

router.delete("/:id", requirePermission("bulletins.manage"), asyncHandler(async (req, res) => {
  const parsed = DeleteAnnouncementParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  await db.delete(announcementsTable).where(eq(announcementsTable.id, parsed.data.id));
  res.status(204).end();
}));

function formatAnnouncement(a: typeof announcementsTable.$inferSelect) {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    category: a.category,
    isUrgent: a.isUrgent,
    urgencyLevel: a.urgencyLevel ?? "normal",
    publishedAt: a.publishedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export default router;
