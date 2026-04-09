import { Router } from "express";
import { db, stewardCoverageTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";
import { z } from "zod/v4";

const createCoverageSchema = z.object({
  stewardId: z.number().int().positive(),
  department: z.string().min(1).max(100),
  shift: z.enum(["days", "afternoons", "nights", "rotating"]),
  areaNotes: z.string().max(1000).nullable().optional(),
});

const updateCoverageSchema = createCoverageSchema.partial();

const router = Router();

router.use(requireSteward);

const coverageSelect = {
  id: stewardCoverageTable.id,
  stewardId: stewardCoverageTable.stewardId,
  stewardName: usersTable.displayName,
  department: stewardCoverageTable.department,
  shift: stewardCoverageTable.shift,
  areaNotes: stewardCoverageTable.areaNotes,
  createdAt: stewardCoverageTable.createdAt,
  updatedAt: stewardCoverageTable.updatedAt,
};

router.get("/", asyncHandler(async (_req, res) => {
  const rows = await db
    .select(coverageSelect)
    .from(stewardCoverageTable)
    .leftJoin(usersTable, eq(stewardCoverageTable.stewardId, usersTable.id))
    .orderBy(stewardCoverageTable.department);
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })));
}));

router.post("/", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  let body: z.infer<typeof createCoverageSchema>;
  try {
    body = createCoverageSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" });
      return;
    }
    throw err;
  }
  const [c] = await db.insert(stewardCoverageTable).values({
    stewardId: body.stewardId,
    department: body.department,
    shift: body.shift,
    areaNotes: body.areaNotes ?? null,
  }).returning({ id: stewardCoverageTable.id });
  const [row] = await db
    .select(coverageSelect)
    .from(stewardCoverageTable)
    .leftJoin(usersTable, eq(stewardCoverageTable.stewardId, usersTable.id))
    .where(eq(stewardCoverageTable.id, c.id));
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const id = parseInt(req.params.id as string, 10);
  let body: z.infer<typeof updateCoverageSchema>;
  try {
    body = updateCoverageSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" });
      return;
    }
    throw err;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.stewardId !== undefined) updates.stewardId = body.stewardId;
  if (body.department !== undefined) updates.department = body.department;
  if (body.shift !== undefined) updates.shift = body.shift;
  if (body.areaNotes !== undefined) updates.areaNotes = body.areaNotes;
  const [c] = await db.update(stewardCoverageTable).set(updates).where(eq(stewardCoverageTable.id, id)).returning({ id: stewardCoverageTable.id });
  if (!c) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  const [row] = await db
    .select(coverageSelect)
    .from(stewardCoverageTable)
    .leftJoin(usersTable, eq(stewardCoverageTable.stewardId, usersTable.id))
    .where(eq(stewardCoverageTable.id, c.id));
  res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  await db.delete(stewardCoverageTable).where(eq(stewardCoverageTable.id, parseInt(req.params.id as string, 10)));
  res.status(204).end();
}));

export default router;
