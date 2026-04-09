import { Router, type Request } from "express";
import { db, meetingsTable } from "@workspace/db";
import { eq, desc, gte } from "drizzle-orm";
import { requirePermission } from "../lib/permissions";
import { sendPushToAll } from "./push";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

function formatMeeting(m: typeof meetingsTable.$inferSelect) {
  return {
    id: m.id,
    title: m.title,
    type: m.type,
    date: m.date.toISOString(),
    location: m.location ?? null,
    agenda: m.agenda ?? null,
    minutes: m.minutes ?? null,
    minutesPublished: m.minutesPublished ?? "draft",
    attendees: (m.attendees as number[]) ?? [],
    createdBy: m.createdBy ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

router.get("/", asyncHandler(async (req: Request, res) => {
  const { upcoming } = req.query;
  let meetings: typeof meetingsTable.$inferSelect[];
  if (upcoming === "true") {
    meetings = await db
      .select()
      .from(meetingsTable)
      .where(gte(meetingsTable.date, new Date()))
      .orderBy(meetingsTable.date);
  } else {
    meetings = await db
      .select()
      .from(meetingsTable)
      .orderBy(desc(meetingsTable.date));
  }

  res.json(meetings.map(formatMeeting));
}));

router.post("/", requirePermission("meetings.manage"), asyncHandler(async (req: Request, res) => {
  const { title, type, date, location, agenda } = req.body;
  if (!title || !date) {
    res.status(400).json({ error: "title and date are required" });
    return;
  }

  const [meeting] = await db
    .insert(meetingsTable)
    .values({
      title,
      type: type ?? "general",
      date: new Date(date),
      location: location ?? null,
      agenda: agenda ?? null,
      createdBy: req.session?.userId ?? null,
    })
    .returning();

  // Notify stewards of new meeting
  sendPushToAll({
    title: `Meeting Scheduled: ${title}`,
    body: `${new Date(date).toLocaleDateString()} — ${location ?? "Location TBD"}`,
    tag: `meeting-${meeting.id}`,
  }).catch(() => {});

  res.status(201).json(formatMeeting(meeting));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMeeting(meeting));
}));

router.patch("/:id", requirePermission("meetings.manage"), asyncHandler(async (req: Request, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { title, type, date, location, agenda, minutes, minutesPublished, attendees } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (title !== undefined) updates.title = title;
  if (type !== undefined) updates.type = type;
  if (date !== undefined) updates.date = new Date(date);
  if (location !== undefined) updates.location = location;
  if (agenda !== undefined) updates.agenda = agenda;
  if (minutes !== undefined) updates.minutes = minutes;
  if (minutesPublished !== undefined) updates.minutesPublished = minutesPublished;
  if (attendees !== undefined) updates.attendees = attendees;

  const [meeting] = await db
    .update(meetingsTable)
    .set(updates)
    .where(eq(meetingsTable.id, id))
    .returning();

  if (!meeting) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMeeting(meeting));
}));

router.delete("/:id", requirePermission("meetings.manage"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(meetingsTable).where(eq(meetingsTable.id, id));
  res.status(204).end();
}));

export default router;
