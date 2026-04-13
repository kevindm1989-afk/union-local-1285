import { Router, type Request } from "express";
import { db, documentsTable, pool } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requirePermission } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

const VALID_CATEGORIES = ["cba", "moa", "bylaw", "policy", "form", "guide"] as const;

function formatDocument(d: typeof documentsTable.$inferSelect) {
  const raw = d as any;
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
    // Version control fields
    versionNumber: raw.versionNumber ?? raw.version_number ?? 1,
    changeNote: raw.changeNote ?? raw.change_note ?? null,
    documentGroupId: raw.documentGroupId ?? raw.document_group_id ?? d.id,
  };
}

// ─── List documents ───────────────────────────────────────────────────────────
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

// ─── Create document (also handles new versions via parentDocumentId) ─────────
router.post("/", requirePermission("documents.upload"), asyncHandler(async (req: Request, res) => {
  const {
    title, category, description, filename, objectPath, contentType,
    fileSize, isCurrent, effectiveDate, expirationDate, notes,
    parentDocumentId, changeNote,
  } = req.body;

  if (!title || !filename || !objectPath || !contentType) {
    res.status(400).json({ error: "Missing required fields: title, filename, objectPath, contentType" });
    return;
  }

  const docCategory = VALID_CATEGORIES.includes(category) ? category : "cba";

  const client = await pool.connect();
  try {
    let documentGroupId: number | null = null;
    let versionNumber = 1;

    if (parentDocumentId) {
      // ── New version of an existing document ────────────────────────────
      const parent = await client.query(
        `SELECT document_group_id, version_number FROM documents WHERE id = $1`,
        [parentDocumentId]
      );
      const parentRow = parent.rows[0];
      if (!parentRow) {
        res.status(404).json({ error: "Parent document not found" }); return;
      }

      documentGroupId = parentRow.document_group_id ?? parentDocumentId;

      // Get highest version number in this group
      const maxVer = await client.query(
        `SELECT MAX(version_number) as max_ver FROM documents WHERE document_group_id = $1`,
        [documentGroupId]
      );
      versionNumber = (maxVer.rows[0]?.max_ver ?? 0) + 1;

      // Archive all current documents in this group
      await client.query(
        `UPDATE documents SET is_current = false, updated_at = NOW() WHERE document_group_id = $1`,
        [documentGroupId]
      );
    } else {
      // ── New standalone document — archive old global current if needed ──
      if (isCurrent) {
        // Only archive others in the same category to allow multiple current docs (one per category group)
        // But maintain backward compat: mark old ones non-current
        await db.update(documentsTable).set({ isCurrent: false, updatedAt: new Date() });
      }
    }

    // Insert new document
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
        isCurrent: parentDocumentId ? true : (isCurrent ?? true),
        effectiveDate: effectiveDate ?? null,
        expirationDate: expirationDate ?? null,
        notes: notes ?? null,
        stewardOnly: req.body.stewardOnly === true,
        uploadedBy: req.session?.userId ?? null,
        ...(versionNumber !== 1 ? { versionNumber } : {}),
        ...(changeNote ? { changeNote } : {}),
      } as any)
      .returning();

    // Set document_group_id: for new standalone docs, group = self; for versions, group = parent's group
    const groupId = documentGroupId ?? doc.id;
    await client.query(
      `UPDATE documents SET document_group_id = $1, version_number = $2 WHERE id = $3`,
      [groupId, versionNumber, doc.id]
    );

    // Return with version fields attached
    res.status(201).json({
      ...formatDocument(doc),
      versionNumber,
      changeNote: changeNote ?? null,
      documentGroupId: groupId,
    });
  } finally {
    client.release();
  }
}));

// ─── Get versions for a document group ───────────────────────────────────────
router.get("/group/:groupId/versions", asyncHandler(async (req: Request, res) => {
  const groupId = parseInt(req.params.groupId as string, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid group ID" }); return; }

  const isSteward = req.session?.role && ["admin", "steward", "chief_steward", "chair"].includes(req.session.role);

  const client = await pool.connect();
  try {
    let query = `
      SELECT d.*, u.display_name as uploader_name
      FROM documents d
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.document_group_id = $1
    `;
    if (!isSteward) query += ` AND d.steward_only = false`;
    query += ` ORDER BY d.version_number DESC, d.uploaded_at DESC`;

    const result = await client.query(query, [groupId]);

    res.json((result.rows as any[]).map((r) => ({
      id: r.id,
      title: r.title,
      versionNumber: r.version_number ?? 1,
      changeNote: r.change_note ?? null,
      isCurrent: r.is_current,
      documentGroupId: r.document_group_id,
      objectPath: r.object_path,
      filename: r.filename,
      contentType: r.content_type,
      fileSize: r.file_size,
      effectiveDate: r.effective_date,
      uploadedBy: r.uploaded_by,
      uploaderName: r.uploader_name ?? null,
      uploadedAt: r.uploaded_at ? new Date(r.uploaded_at).toISOString() : null,
      stewardOnly: r.steward_only,
    })));
  } finally {
    client.release();
  }
}));

// ─── Get one document ──────────────────────────────────────────────────────────
router.get("/:id", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatDocument(doc));
}));

// ─── Update document ──────────────────────────────────────────────────────────
router.patch("/:id", requirePermission("documents.upload"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { title, category, description, isCurrent, effectiveDate, expirationDate, notes, changeNote } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (category !== undefined && VALID_CATEGORIES.includes(category)) updates.category = category;
  if (description !== undefined) updates.description = description;
  if (isCurrent !== undefined) updates.isCurrent = isCurrent;
  if (effectiveDate !== undefined) updates.effectiveDate = effectiveDate;
  if (expirationDate !== undefined) updates.expirationDate = expirationDate;
  if (notes !== undefined) updates.notes = notes;
  if (changeNote !== undefined) (updates as any).changeNote = changeNote;
  if (req.body.stewardOnly !== undefined) updates.stewardOnly = req.body.stewardOnly === true;

  const [doc] = await db.update(documentsTable).set(updates).where(eq(documentsTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatDocument(doc));
}));

// ─── Delete document ───────────────────────────────────────────────────────────
router.delete("/:id", requirePermission("documents.upload"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(documentsTable).where(eq(documentsTable.id, id));
  res.status(204).end();
}));

export default router;
