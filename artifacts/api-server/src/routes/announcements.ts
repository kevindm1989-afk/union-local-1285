import { Router } from "express";
import { db, announcementsTable } from "@workspace/db";
import { requirePermission } from "../lib/permissions";
import { eq, desc } from "drizzle-orm";
import { notifyUrgentBulletin } from "../lib/notifications";
import {
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
  ListAnnouncementsQueryParams,
  GetAnnouncementParams,
  UpdateAnnouncementParams,
  DeleteAnnouncementParams,
} from "@workspace/api-zod";
import { asyncHandler } from "../lib/asyncHandler";

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
  const [announcement] = await db
    .insert(announcementsTable)
    .values({
      title: d.title,
      content: d.content,
      category: d.category ?? "general",
      isUrgent: d.isUrgent ?? false,
    })
    .returning();

  if (announcement.isUrgent) {
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

  const bodyParsed = UpdateAnnouncementBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const d = bodyParsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.title !== undefined) updates.title = d.title;
  if (d.content !== undefined) updates.content = d.content;
  if (d.category !== undefined) updates.category = d.category;
  if (d.isUrgent !== undefined) updates.isUrgent = d.isUrgent;

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
    publishedAt: a.publishedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export default router;
