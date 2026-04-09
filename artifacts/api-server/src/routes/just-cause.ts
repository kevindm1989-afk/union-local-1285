import { Router } from "express";
import { db, justCauseAssessmentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router({ mergeParams: true });

router.use(requireSteward);

function fmt(a: typeof justCauseAssessmentsTable.$inferSelect) {
  return {
    id: a.id,
    grievanceId: a.grievanceId,
    assessedBy: a.assessedBy,
    assessedAt: a.assessedAt.toISOString(),
    adequateNotice: a.adequateNotice,
    reasonableRule: a.reasonableRule,
    investigationConducted: a.investigationConducted,
    investigationFair: a.investigationFair,
    proofSufficient: a.proofSufficient,
    penaltyConsistent: a.penaltyConsistent,
    penaltyProgressive: a.penaltyProgressive,
    notes: a.notes,
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const grievanceId = parseInt((req.params as Record<string, string>).grievanceId, 10);
  const [assessment] = await db
    .select()
    .from(justCauseAssessmentsTable)
    .where(eq(justCauseAssessmentsTable.grievanceId, grievanceId));
  res.json(assessment ? fmt(assessment) : null);
}));

router.post("/", asyncHandler(async (req, res) => {
  const grievanceId = parseInt((req.params as Record<string, string>).grievanceId, 10);
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }); return; }

  const body = req.body as Record<string, unknown>;
  const values = {
    grievanceId,
    assessedBy: userId,
    assessedAt: new Date(),
    adequateNotice: Boolean(body.adequateNotice),
    reasonableRule: Boolean(body.reasonableRule),
    investigationConducted: Boolean(body.investigationConducted),
    investigationFair: Boolean(body.investigationFair),
    proofSufficient: Boolean(body.proofSufficient),
    penaltyConsistent: Boolean(body.penaltyConsistent),
    penaltyProgressive: Boolean(body.penaltyProgressive),
    notes: (body.notes as string) ?? null,
  };

  const existing = await db.select().from(justCauseAssessmentsTable).where(eq(justCauseAssessmentsTable.grievanceId, grievanceId));
  if (existing.length > 0) {
    const [updated] = await db.update(justCauseAssessmentsTable).set(values).where(eq(justCauseAssessmentsTable.grievanceId, grievanceId)).returning();
    res.json(fmt(updated));
  } else {
    const [created] = await db.insert(justCauseAssessmentsTable).values(values).returning();
    res.status(201).json(fmt(created));
  }
}));

export default router;
