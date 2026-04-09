import { Router } from "express";
import { db, memberCommunicationLogTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";
import { z } from "zod/v4";

const createCommunicationSchema = z.object({
  contactMethod: z.enum(["in_person", "phone", "text", "email", "voicemail", "no_answer"]),
  summary: z.string().min(1).max(2000),
  contactDate: z.string().date(),
  memberId: z.number().int().positive().optional(),
});

const router = Router({ mergeParams: true });

router.use(requireSteward);

function fmt(e: typeof memberCommunicationLogTable.$inferSelect) {
  return {
    id: e.id,
    grievanceId: e.grievanceId,
    memberId: e.memberId,
    loggedBy: e.loggedBy,
    loggedByName: e.loggedByName,
    contactMethod: e.contactMethod,
    summary: e.summary,
    contactDate: e.contactDate,
    createdAt: e.createdAt.toISOString(),
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const grievanceId = parseInt((req.params as Record<string, string>).grievanceId, 10);
  const entries = await db
    .select()
    .from(memberCommunicationLogTable)
    .where(eq(memberCommunicationLogTable.grievanceId, grievanceId))
    .orderBy(desc(memberCommunicationLogTable.contactDate));
  res.json(entries.map(fmt));
}));

router.post("/", asyncHandler(async (req, res) => {
  const grievanceId = parseInt((req.params as Record<string, string>).grievanceId, 10);
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }); return; }

  let body: z.infer<typeof createCommunicationSchema>;
  try {
    body = createCommunicationSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" });
      return;
    }
    throw err;
  }

  const [u] = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, userId));
  const [entry] = await db.insert(memberCommunicationLogTable).values({
    grievanceId,
    memberId: body.memberId ?? null,
    loggedBy: userId,
    loggedByName: u?.displayName ?? null,
    contactMethod: body.contactMethod,
    summary: body.summary,
    contactDate: body.contactDate,
  }).returning();

  res.status(201).json(fmt(entry));
}));

export default router;
