import { Router } from "express";
import { db, stewardCoverageTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

router.use(requireSteward);

async function fmt(c: typeof stewardCoverageTable.$inferSelect) {
  const [u] = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, c.stewardId));
  return {
    id: c.id,
    stewardId: c.stewardId,
    stewardName: u?.displayName ?? null,
    department: c.department,
    shift: c.shift,
    areaNotes: c.areaNotes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(stewardCoverageTable).orderBy(stewardCoverageTable.department);
  const result = await Promise.all(rows.map(fmt));
  res.json(result);
}));

router.post("/", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const body = req.body as Record<string, unknown>;
  if (!body.stewardId || !body.department) {
    res.status(400).json({ error: "stewardId and department required", code: "INVALID_BODY" }); return;
  }
  const [c] = await db.insert(stewardCoverageTable).values({
    stewardId: Number(body.stewardId),
    department: body.department as string,
    shift: (body.shift as "days" | "afternoons" | "nights" | "rotating") ?? "days",
    areaNotes: (body.areaNotes as string) ?? null,
  }).returning();
  res.status(201).json(await fmt(c));
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const id = parseInt(req.params.id as string, 10);
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.stewardId) updates.stewardId = Number(body.stewardId);
  if (body.department) updates.department = body.department;
  if (body.shift) updates.shift = body.shift;
  if (body.areaNotes !== undefined) updates.areaNotes = body.areaNotes;
  const [c] = await db.update(stewardCoverageTable).set(updates).where(eq(stewardCoverageTable.id, id)).returning();
  if (!c) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  res.json(await fmt(c));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  await db.delete(stewardCoverageTable).where(eq(stewardCoverageTable.id, parseInt(req.params.id as string, 10)));
  res.status(204).end();
}));

export default router;
