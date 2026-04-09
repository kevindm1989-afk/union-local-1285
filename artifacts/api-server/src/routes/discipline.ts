import { Router } from "express";
import { db, disciplineRecordsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router({ mergeParams: true });

router.use(requireSteward);

function fmt(r: typeof disciplineRecordsTable.$inferSelect) {
  return {
    id: r.id,
    memberId: r.memberId,
    disciplineType: r.disciplineType,
    incidentDate: r.incidentDate,
    issuedDate: r.issuedDate,
    description: r.description,
    responseFiled: r.responseFiled,
    grievanceId: r.grievanceId,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const memberId = parseInt((req.params as Record<string, string>).memberId, 10);
  const records = await db
    .select()
    .from(disciplineRecordsTable)
    .where(eq(disciplineRecordsTable.memberId, memberId))
    .orderBy(asc(disciplineRecordsTable.incidentDate));
  res.json(records.map(fmt));
}));

router.post("/", asyncHandler(async (req, res) => {
  const memberId = parseInt((req.params as Record<string, string>).memberId, 10);
  const body = req.body as Record<string, unknown>;
  if (!body.incidentDate || !body.issuedDate || !body.description) {
    res.status(400).json({ error: "incidentDate, issuedDate, description required", code: "INVALID_BODY" }); return;
  }
  const [r] = await db.insert(disciplineRecordsTable).values({
    memberId,
    disciplineType: (body.disciplineType as "verbal_warning" | "written_warning" | "suspension_paid" | "suspension_unpaid" | "termination" | "other") ?? "verbal_warning",
    incidentDate: body.incidentDate as string,
    issuedDate: body.issuedDate as string,
    description: body.description as string,
    responseFiled: Boolean(body.responseFiled),
    grievanceId: body.grievanceId ? Number(body.grievanceId) : null,
    createdBy: req.session?.userId ?? null,
  }).returning();
  res.status(201).json(fmt(r));
}));

router.patch("/:recordId", asyncHandler(async (req, res) => {
  const recordId = parseInt(req.params.recordId as string, 10);
  const memberId = parseInt((req.params as Record<string, string>).memberId, 10);
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (body.disciplineType !== undefined) updates.disciplineType = body.disciplineType;
  if (body.incidentDate !== undefined) updates.incidentDate = body.incidentDate;
  if (body.issuedDate !== undefined) updates.issuedDate = body.issuedDate;
  if (body.description !== undefined) updates.description = body.description;
  if (body.responseFiled !== undefined) updates.responseFiled = Boolean(body.responseFiled);
  if (body.grievanceId !== undefined) updates.grievanceId = body.grievanceId ? Number(body.grievanceId) : null;
  const [r] = await db.update(disciplineRecordsTable).set(updates).where(and(eq(disciplineRecordsTable.id, recordId), eq(disciplineRecordsTable.memberId, memberId))).returning();
  if (!r) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  res.json(fmt(r));
}));

router.delete("/:recordId", asyncHandler(async (req, res) => {
  const recordId = parseInt(req.params.recordId as string, 10);
  const memberId = parseInt((req.params as Record<string, string>).memberId, 10);
  await db.delete(disciplineRecordsTable).where(and(eq(disciplineRecordsTable.id, recordId), eq(disciplineRecordsTable.memberId, memberId)));
  res.status(204).end();
}));

export default router;
