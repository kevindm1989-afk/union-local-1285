import { Router } from "express";
import { db, grievancesTable, membersTable } from "@workspace/db";
import { eq, and, desc, sql, lt } from "drizzle-orm";
import {
  CreateGrievanceBody,
  UpdateGrievanceBody,
  ListGrievancesQueryParams,
  GetGrievanceParams,
  UpdateGrievanceParams,
  DeleteGrievanceParams,
} from "@workspace/api-zod";

const router = Router();

async function lookupMemberName(memberId: number | null | undefined): Promise<string | null> {
  if (!memberId) return null;
  const [m] = await db.select({ name: membersTable.name }).from(membersTable).where(eq(membersTable.id, memberId));
  return m?.name ?? null;
}

function formatGrievance(g: typeof grievancesTable.$inferSelect, memberName?: string | null) {
  return {
    id: g.id,
    grievanceNumber: g.grievanceNumber,
    memberId: g.memberId ?? null,
    memberName: memberName ?? null,
    title: g.title,
    description: g.description ?? null,
    contractArticle: g.contractArticle ?? null,
    step: g.step,
    status: g.status,
    filedDate: g.filedDate,
    dueDate: g.dueDate ?? null,
    resolvedDate: g.resolvedDate ?? null,
    resolution: g.resolution ?? null,
    notes: g.notes ?? null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

function generateGrievanceNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `GRV-${year}-${rand}`;
}

router.get("/", async (req, res) => {
  const parsed = ListGrievancesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { status, step, memberId } = parsed.data;
  const conditions = [];
  if (status) conditions.push(eq(grievancesTable.status, status));
  if (step !== undefined) conditions.push(eq(grievancesTable.step, step));
  if (memberId !== undefined) conditions.push(eq(grievancesTable.memberId, memberId));

  const grievances = await db
    .select()
    .from(grievancesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(grievancesTable.filedDate));

  const withNames = await Promise.all(
    grievances.map(async (g) => {
      const name = await lookupMemberName(g.memberId);
      return formatGrievance(g, name);
    }),
  );

  res.json(withNames);
});

router.post("/", async (req, res) => {
  const parsed = CreateGrievanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const d = parsed.data;
  const [grievance] = await db
    .insert(grievancesTable)
    .values({
      grievanceNumber: generateGrievanceNumber(),
      memberId: d.memberId ?? null,
      title: d.title,
      description: d.description ?? null,
      contractArticle: d.contractArticle ?? null,
      step: d.step ?? 1,
      status: d.status ?? "open",
      filedDate: d.filedDate,
      dueDate: d.dueDate ?? null,
      notes: d.notes ?? null,
    })
    .returning();

  const memberName = await lookupMemberName(grievance.memberId);
  res.status(201).json(formatGrievance(grievance, memberName));
});

router.get("/stats/summary", async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where status = 'open')::int`,
      pending_response: sql<number>`count(*) filter (where status = 'pending_response')::int`,
      pending_hearing: sql<number>`count(*) filter (where status = 'pending_hearing')::int`,
      resolved: sql<number>`count(*) filter (where status = 'resolved')::int`,
      withdrawn: sql<number>`count(*) filter (where status = 'withdrawn')::int`,
      overdue: sql<number>`count(*) filter (where due_date < ${today} and status not in ('resolved','withdrawn'))::int`,
      step1: sql<number>`count(*) filter (where step = 1)::int`,
      step2: sql<number>`count(*) filter (where step = 2)::int`,
      step3: sql<number>`count(*) filter (where step = 3)::int`,
      step4: sql<number>`count(*) filter (where step = 4)::int`,
    })
    .from(grievancesTable);

  res.json(row);
});

router.get("/:id", async (req, res) => {
  const parsed = GetGrievanceParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [grievance] = await db
    .select()
    .from(grievancesTable)
    .where(eq(grievancesTable.id, parsed.data.id));

  if (!grievance) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const memberName = await lookupMemberName(grievance.memberId);
  res.json(formatGrievance(grievance, memberName));
});

router.patch("/:id", async (req, res) => {
  const paramParsed = UpdateGrievanceParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const bodyParsed = UpdateGrievanceBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const d = bodyParsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.memberId !== undefined) updates.memberId = d.memberId;
  if (d.title !== undefined) updates.title = d.title;
  if (d.description !== undefined) updates.description = d.description;
  if (d.contractArticle !== undefined) updates.contractArticle = d.contractArticle;
  if (d.step !== undefined) updates.step = d.step;
  if (d.status !== undefined) updates.status = d.status;
  if (d.filedDate !== undefined) updates.filedDate = d.filedDate;
  if (d.dueDate !== undefined) updates.dueDate = d.dueDate;
  if (d.resolvedDate !== undefined) updates.resolvedDate = d.resolvedDate;
  if (d.resolution !== undefined) updates.resolution = d.resolution;
  if (d.notes !== undefined) updates.notes = d.notes;

  const [grievance] = await db
    .update(grievancesTable)
    .set(updates)
    .where(eq(grievancesTable.id, paramParsed.data.id))
    .returning();

  if (!grievance) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const memberName = await lookupMemberName(grievance.memberId);
  res.json(formatGrievance(grievance, memberName));
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteGrievanceParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  await db.delete(grievancesTable).where(eq(grievancesTable.id, parsed.data.id));
  res.status(204).end();
});

export default router;
