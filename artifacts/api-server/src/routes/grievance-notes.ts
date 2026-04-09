import { Router } from "express";
import { db, grievanceNotesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router({ mergeParams: true });

router.get("/", asyncHandler(async (req, res) => {
  const grievanceId = Number((req.params as Record<string, string>).grievanceId);
  if (isNaN(grievanceId)) {
    res.status(400).json({ error: "Invalid grievance ID" });
    return;
  }

  const notes = await db
    .select()
    .from(grievanceNotesTable)
    .where(eq(grievanceNotesTable.grievanceId, grievanceId))
    .orderBy(desc(grievanceNotesTable.createdAt));

  res.json(
    notes.map((n) => ({
      id: n.id,
      grievanceId: n.grievanceId,
      userId: n.userId ?? null,
      authorName: n.authorName ?? null,
      content: n.content,
      noteType: n.noteType,
      createdAt: n.createdAt.toISOString(),
    })),
  );
}));

router.post("/", requirePermission("grievances.file"), asyncHandler(async (req, res) => {
  const grievanceId = Number((req.params as Record<string, string>).grievanceId);
  if (isNaN(grievanceId)) {
    res.status(400).json({ error: "Invalid grievance ID" });
    return;
  }

  const { content } = req.body as { content?: string };
  if (!content?.trim()) {
    res.status(400).json({ error: "Note content is required" });
    return;
  }

  const userId = req.session?.userId ?? null;
  let authorName: string | null = null;
  if (userId) {
    const [user] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    authorName = user?.displayName ?? null;
  }

  const [note] = await db
    .insert(grievanceNotesTable)
    .values({
      grievanceId,
      userId,
      authorName,
      content: content.trim(),
      noteType: "note",
    })
    .returning();

  res.status(201).json({
    id: note.id,
    grievanceId: note.grievanceId,
    userId: note.userId ?? null,
    authorName: note.authorName ?? null,
    content: note.content,
    noteType: note.noteType,
    createdAt: note.createdAt.toISOString(),
  });
}));

export default router;
