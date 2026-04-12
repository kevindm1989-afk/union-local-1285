import { Router, type Request } from "express";
import { db, documentsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requirePermission } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

const VALID_CATEGORIES = ["cba", "moa", "bylaw", "policy", "form", "guide"] as const;

function formatDocument(d: typeof documentsTable.$inferSelect) {
  return {
    id: d.id,
    title: d.title,
    category: d.category ?? "cba",
    description: d.description ?? null,
    filename: d.filename,
    objectPath: d.objectPath,
    contentType: d.contentType,
    fileSize: d.fileSize ?? null,
    isCurrent: d.isCurrent,
    effectiveDate: d.effectiveDate ?? null,
    expirationDate: d.expirationDate ?? null,
    notes: d.notes ?? null,
    stewardOnly: d.stewardOnly ?? false,
    uploadedBy: d.uploadedBy ?? null,
    uploadedAt: d.uploadedAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/", asyncHandler(async (req: Request, res) => {
  const { category } = req.query;
  const isSteward = req.session?.role && ["admin", "steward", "chief_steward", "chair"].includes(req.session.role);

  const conditions = [];
  if (category && typeof category === "string" && VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    conditions.push(eq(documentsTable.category, category));
  }
  if (!isSteward) {
    conditions.push(eq(documentsTable.stewardOnly, false));
  }

  const docs = await db
    .select()
    .from(documentsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(documentsTable.uploadedAt));
  res.json(docs.map(formatDocument));
}));

router.post("/", requirePermission("documents.upload"), asyncHandler(async (req: Request, res) => {
  const { title, category, description, filename, objectPath, contentType, fileSize, isCurrent, effectiveDate, expirationDate, notes } = req.body;

  if (!title || !filename || !objectPath || !contentType) {
    res.status(400).json({ error: "Missing required fields: title, filename, objectPath, contentType" });
    return;
  }

  const docCategory = VALID_CATEGORIES.includes(category) ? category : "cba";

  if (isCurrent) {
    await db.update(documentsTable).set({ isCurrent: false, updatedAt: new Date() });
  }

  const [doc] = await db
    .insert(documentsTable)
    .values({
      title,
      category: docCategory,
      description: description ?? null,
      filename,
      objectPath,
      contentType,
      fileSize: fileSize ?? null,
      isCurrent: isCurrent ?? true,
      effectiveDate: effectiveDate ?? null,
      expirationDate: expirationDate ?? null,
      notes: notes ?? null,
      stewardOnly: req.body.stewardOnly === true,
      uploadedBy: req.session?.userId ?? null,
    })
    .returning();

  res.status(201).json(formatDocument(doc));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatDocument(doc));
}));

router.patch("/:id", requirePermission("documents.upload"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { title, category, description, isCurrent, effectiveDate, expirationDate, notes } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (category !== undefined && VALID_CATEGORIES.includes(category)) updates.category = category;
  if (description !== undefined) updates.description = description;
  if (isCurrent !== undefined) updates.isCurrent = isCurrent;
  if (effectiveDate !== undefined) updates.effectiveDate = effectiveDate;
  if (expirationDate !== undefined) updates.expirationDate = expirationDate;
  if (notes !== undefined) updates.notes = notes;
  if (req.body.stewardOnly !== undefined) updates.stewardOnly = req.body.stewardOnly === true;

  const [doc] = await db.update(documentsTable).set(updates).where(eq(documentsTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatDocument(doc));
}));

router.delete("/:id", requirePermission("documents.upload"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(documentsTable).where(eq(documentsTable.id, id));
  res.status(204).end();
}));

export default router;
