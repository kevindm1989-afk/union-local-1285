import { Router } from "express";
import { db, caseJournalTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router({ mergeParams: true });

router.use(requireSteward);

function fmt(e: typeof caseJournalTable.$inferSelect) {
  return {
    id: e.id,
    grievanceId: e.grievanceId,
    authorId: e.authorId,
    authorName: e.authorName,
    entryType: e.entryType,
    content: e.content,
    isPrivate: e.isPrivate,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const grievanceId = parseInt((req.params as Record<string, string>).grievanceId, 10);
  const entries = await db
    .select()
    .from(caseJournalTable)
    .where(eq(caseJournalTable.grievanceId, grievanceId))
    .orderBy(desc(caseJournalTable.createdAt));
  res.json(entries.map(fmt));
}));

router.post("/", asyncHandler(async (req, res) => {
  const grievanceId = parseInt((req.params as Record<string, string>).grievanceId, 10);
  const authorId = req.session?.userId;
  if (!authorId) { res.status(401).json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }); return; }

  const { entryType, content, isPrivate } = req.body as Record<string, unknown>;
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content is required", code: "INVALID_BODY" });
    return;
  }

  const [u] = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, authorId));
  const [entry] = await db.insert(caseJournalTable).values({
    grievanceId,
    authorId,
    authorName: u?.displayName ?? null,
    entryType: (entryType as "note" | "call" | "meeting" | "email" | "management_contact") ?? "note",
    content: content.trim(),
    isPrivate: isPrivate !== false,
  }).returning();

  res.status(201).json(fmt(entry));
}));

router.patch("/:entryId", asyncHandler(async (req, res) => {
  const entryId = parseInt(req.params.entryId as string, 10);
  const userId = req.session?.userId;
  const [existing] = await db.select().from(caseJournalTable).where(eq(caseJournalTable.id, entryId));
  if (!existing) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  if (existing.authorId !== userId && req.session?.role !== "admin") {
    res.status(403).json({ error: "Can only edit your own entries", code: "FORBIDDEN" }); return;
  }
  const { content, entryType } = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (content && typeof content === "string") updates.content = content.trim();
  if (entryType) updates.entryType = entryType;
  const [updated] = await db.update(caseJournalTable).set(updates).where(eq(caseJournalTable.id, entryId)).returning();
  res.json(fmt(updated));
}));

router.delete("/:entryId", asyncHandler(async (req, res) => {
  const entryId = parseInt(req.params.entryId as string, 10);
  const userId = req.session?.userId;
  const [existing] = await db.select().from(caseJournalTable).where(eq(caseJournalTable.id, entryId));
  if (!existing) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  if (existing.authorId !== userId && req.session?.role !== "admin") {
    res.status(403).json({ error: "Can only delete your own entries", code: "FORBIDDEN" }); return;
  }
  await db.delete(caseJournalTable).where(and(eq(caseJournalTable.id, entryId)));
  res.status(204).end();
}));

export default router;
