import { Router, type Request } from "express";
import { z } from "zod/v4";
import { db, meetingsTable } from "@workspace/db";
import { eq, desc, gte } from "drizzle-orm";
import { requirePermission } from "../lib/permissions";
import { sendPushToAll } from "./push";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const agendaItemSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(1000),
  done: z.boolean().default(false),
});

const createMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(["executive", "general", "stewards"]),
  date: z.string().datetime(),
  location: z.string().min(1).max(500),
  agenda: z.string().max(10000).nullable().optional(),
  agendaItems: z.array(agendaItemSchema).default([]),
  minutes: z.string().max(50000).nullable().optional(),
  attendees: z.array(z.number().int().positive()).default([]),
  attendanceData: z.record(z.string(), z.enum(["present", "absent", "excused"])).default({}),
});

const updateMeetingSchema = createMeetingSchema.partial();

function formatMeeting(m: typeof meetingsTable.$inferSelect) {
  return {
    id: m.id,
    title: m.title,
    type: m.type,
    date: m.date.toISOString(),
    location: m.location ?? null,
    agenda: m.agenda ?? null,
    agendaItems: (m.agendaItems as { id: string; text: string; done: boolean }[]) ?? [],
    minutes: m.minutes ?? null,
    minutesPublished: m.minutesPublished ?? "draft",
    attendees: (m.attendees as number[]) ?? [],
    attendanceData: (m.attendanceData as Record<string, "present" | "absent" | "excused">) ?? {},
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
  let body: z.infer<typeof createMeetingSchema>;
  try {
    body = createMeetingSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" }); return;
    }
    throw err;
  }

  const [meeting] = await db
    .insert(meetingsTable)
    .values({
      title: body.title,
      type: body.type,
      date: new Date(body.date),
      location: body.location ?? null,
      agenda: body.agenda ?? null,
      agendaItems: body.agendaItems ?? [],
      attendees: body.attendees ?? [],
      attendanceData: body.attendanceData ?? {},
      createdBy: req.session?.userId ?? null,
    })
    .returning();

  // Notify stewards of new meeting
  sendPushToAll({
    title: `Meeting Scheduled: ${body.title}`,
    body: `${new Date(body.date).toLocaleDateString()} — ${body.location ?? "Location TBD"}`,
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

  let body: z.infer<typeof updateMeetingSchema>;
  try {
    body = updateMeetingSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" }); return;
    }
    throw err;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.title !== undefined) updates.title = body.title;
  if (body.type !== undefined) updates.type = body.type;
  if (body.date !== undefined) updates.date = new Date(body.date);
  if (body.location !== undefined) updates.location = body.location;
  if (body.agenda !== undefined) updates.agenda = body.agenda;
  if (body.agendaItems !== undefined) updates.agendaItems = body.agendaItems;
  if (body.minutes !== undefined) updates.minutes = body.minutes;
  if (body.attendees !== undefined) updates.attendees = body.attendees;
  if (body.attendanceData !== undefined) updates.attendanceData = body.attendanceData;

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
