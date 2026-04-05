import { Router } from "express";
import { db, membersTable, grievancesTable } from "@workspace/db";
import { eq, and, ilike, or, desc } from "drizzle-orm";
import {
  CreateMemberBody,
  UpdateMemberBody,
  ListMembersQueryParams,
  GetMemberParams,
  UpdateMemberParams,
  DeleteMemberParams,
  GetMemberGrievancesParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const parsed = ListMembersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { department, classification, search } = parsed.data;
  const conditions = [];
  if (department) conditions.push(eq(membersTable.department, department));
  if (classification) conditions.push(eq(membersTable.classification, classification));
  if (search) {
    conditions.push(
      or(
        ilike(membersTable.name, `%${search}%`),
        ilike(membersTable.employeeId, `%${search}%`),
        ilike(membersTable.department, `%${search}%`),
      )!,
    );
  }

  const members = await db
    .select()
    .from(membersTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(membersTable.name);

  res.json(members.map(formatMember));
});

router.post("/", async (req, res) => {
  const parsed = CreateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const d = parsed.data;
  const [member] = await db
    .insert(membersTable)
    .values({
      name: d.name,
      employeeId: d.employeeId ?? null,
      department: d.department ?? null,
      classification: d.classification ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      joinDate: d.joinDate ?? null,
      isActive: d.isActive ?? true,
      notes: d.notes ?? null,
    })
    .returning();

  res.status(201).json(formatMember(member));
});

router.get("/:id/grievances", async (req, res) => {
  const parsed = GetMemberGrievancesParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, parsed.data.id));

  if (!member) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const grievances = await db
    .select()
    .from(grievancesTable)
    .where(eq(grievancesTable.memberId, parsed.data.id))
    .orderBy(desc(grievancesTable.filedDate));

  res.json(grievances.map((g) => formatGrievanceWithMember(g, member.name)));
});

router.get("/:id", async (req, res) => {
  const parsed = GetMemberParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, parsed.data.id));

  if (!member) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(formatMember(member));
});

router.patch("/:id", async (req, res) => {
  const paramParsed = UpdateMemberParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const bodyParsed = UpdateMemberBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const d = bodyParsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name !== undefined) updates.name = d.name;
  if (d.employeeId !== undefined) updates.employeeId = d.employeeId;
  if (d.department !== undefined) updates.department = d.department;
  if (d.classification !== undefined) updates.classification = d.classification;
  if (d.phone !== undefined) updates.phone = d.phone;
  if (d.email !== undefined) updates.email = d.email;
  if (d.joinDate !== undefined) updates.joinDate = d.joinDate;
  if (d.isActive !== undefined) updates.isActive = d.isActive;
  if (d.notes !== undefined) updates.notes = d.notes;

  const [member] = await db
    .update(membersTable)
    .set(updates)
    .where(eq(membersTable.id, paramParsed.data.id))
    .returning();

  if (!member) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(formatMember(member));
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteMemberParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  await db.delete(membersTable).where(eq(membersTable.id, parsed.data.id));
  res.status(204).end();
});

function formatMember(m: typeof membersTable.$inferSelect) {
  return {
    id: m.id,
    name: m.name,
    employeeId: m.employeeId ?? null,
    department: m.department ?? null,
    classification: m.classification ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    joinDate: m.joinDate ?? null,
    isActive: m.isActive,
    notes: m.notes ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function formatGrievanceWithMember(
  g: typeof grievancesTable.$inferSelect,
  memberName: string | null,
) {
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

export default router;
