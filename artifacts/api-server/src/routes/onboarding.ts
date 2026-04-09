import { Router } from "express";
import { db, onboardingChecklistsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router({ mergeParams: true });

router.use(requireSteward);

function fmt(c: typeof onboardingChecklistsTable.$inferSelect) {
  const items = [
    c.cardSigned, c.duesExplained, c.cbaProvided,
    c.stewardIntroduced, c.rightsExplained, c.benefitsExplained,
  ];
  const completedCount = items.filter(Boolean).length;
  return {
    id: c.id,
    memberId: c.memberId,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    cardSigned: c.cardSigned,
    duesExplained: c.duesExplained,
    cbaProvided: c.cbaProvided,
    stewardIntroduced: c.stewardIntroduced,
    rightsExplained: c.rightsExplained,
    benefitsExplained: c.benefitsExplained,
    completedAt: c.completedAt?.toISOString() ?? null,
    completedCount,
    total: 6,
    isComplete: completedCount === 6,
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const memberId = parseInt((req.params as Record<string, string>).memberId, 10);
  const [checklist] = await db.select().from(onboardingChecklistsTable).where(eq(onboardingChecklistsTable.memberId, memberId));
  res.json(checklist ? fmt(checklist) : null);
}));

router.patch("/", asyncHandler(async (req, res) => {
  const memberId = parseInt((req.params as Record<string, string>).memberId, 10);
  const userId = req.session?.userId;
  const body = req.body as Record<string, boolean | null | undefined>;

  const fields: (keyof typeof body)[] = ["cardSigned", "duesExplained", "cbaProvided", "stewardIntroduced", "rightsExplained", "benefitsExplained"];
  const updates: Record<string, unknown> = {};
  for (const f of fields) {
    if (body[f] !== undefined) updates[f === "cardSigned" ? "card_signed" : f.replace(/([A-Z])/g, "_$1").toLowerCase()] = Boolean(body[f]);
  }

  // Map camelCase to snake_case properly
  const dbUpdates: Record<string, unknown> = {};
  if (body.cardSigned !== undefined) dbUpdates.cardSigned = Boolean(body.cardSigned);
  if (body.duesExplained !== undefined) dbUpdates.duesExplained = Boolean(body.duesExplained);
  if (body.cbaProvided !== undefined) dbUpdates.cbaProvided = Boolean(body.cbaProvided);
  if (body.stewardIntroduced !== undefined) dbUpdates.stewardIntroduced = Boolean(body.stewardIntroduced);
  if (body.rightsExplained !== undefined) dbUpdates.rightsExplained = Boolean(body.rightsExplained);
  if (body.benefitsExplained !== undefined) dbUpdates.benefitsExplained = Boolean(body.benefitsExplained);

  const [existing] = await db.select().from(onboardingChecklistsTable).where(eq(onboardingChecklistsTable.memberId, memberId));
  let result: typeof onboardingChecklistsTable.$inferSelect;

  if (existing) {
    // Check if now complete
    const merged = { ...existing, ...dbUpdates };
    const allDone = merged.cardSigned && merged.duesExplained && merged.cbaProvided && merged.stewardIntroduced && merged.rightsExplained && merged.benefitsExplained;
    if (allDone && !existing.completedAt) dbUpdates.completedAt = new Date();
    const [u] = await db.update(onboardingChecklistsTable).set(dbUpdates).where(eq(onboardingChecklistsTable.memberId, memberId)).returning();
    result = u;
  } else {
    const [c] = await db.insert(onboardingChecklistsTable).values({
      memberId,
      createdBy: userId ?? null,
      ...dbUpdates,
    }).returning();
    result = c;
  }
  res.json(fmt(result));
}));

export default router;
