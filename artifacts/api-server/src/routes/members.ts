import { Router } from "express";
import multer from "multer";
import { z } from "zod/v4";
import { db, membersTable, grievancesTable, memberFilesTable, usersTable } from "@workspace/db";
import { eq, and, ilike, or, desc } from "drizzle-orm";
import { sendMemberDeactivatedEmail } from "../lib/email";
import { requirePermission } from "../lib/permissions";
import { storageUpload } from "../lib/storageAdapter";
import { logAudit } from "../lib/auditLog";
import { asyncHandler } from "../lib/asyncHandler";
import {
  CreateMemberBody,
  ListMembersQueryParams,
  GetMemberParams,
  UpdateMemberParams,
  DeleteMemberParams,
  GetMemberGrievancesParams,
} from "@workspace/api-zod";

// ─── PATCH /members/:id — full body schema with role-sensitive field gating ──

const DUES_STATUS = ["current", "arrears", "exempt"] as const;
const SHIFT_VALUES = ["days", "afternoons", "nights", "rotating"] as const;

/** Fields any role with members.edit permission can update */
const baseUpdateFields = {
  name:               z.string().min(1).max(255).optional(),
  employeeId:         z.string().max(50).nullable().optional(),
  department:         z.string().max(100).nullable().optional(),
  classification:     z.string().max(100).nullable().optional(),
  phone:              z.string().max(30).nullable().optional(),
  email:              z.email().max(255).nullable().optional(),
  joinDate:           z.string().nullable().optional(),
  shift:              z.enum(SHIFT_VALUES).nullable().optional(),
  classificationDate: z.string().nullable().optional(),
  smsEnabled:         z.boolean().optional(),
  emailEnabled:       z.boolean().optional(),
  pushEnabled:        z.boolean().optional(),
};

/** Additional fields only admin / steward / chair roles may apply */
const privilegedUpdateFields = {
  isActive:            z.boolean().optional(),
  notes:               z.string().max(10000).nullable().optional(),
  duesStatus:          z.enum(DUES_STATUS).nullable().optional(),
  duesLastPaid:        z.string().nullable().optional(),
  seniorityDate:       z.string().nullable().optional(),
  seniorityRank:       z.number().int().positive().nullable().optional(),
  accommodationActive: z.boolean().optional(),
  stewardNotes:        z.string().max(10000).nullable().optional(),
};

const PatchMemberBodySchema = z.object({
  ...baseUpdateFields,
  ...privilegedUpdateFields,
});

/** Privileged-field keys — stripped when the caller is a plain member */
const PRIVILEGED_FIELDS = Object.keys(privilegedUpdateFields) as (keyof typeof privilegedUpdateFields)[];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
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

  res.json(members.map((m) => formatMember(m)));
}));

router.post("/", requirePermission("members.edit"), asyncHandler(async (req, res) => {
  const parsed = CreateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const d = parsed.data;
  const body = req.body as Record<string, unknown>;

  if (d.email) {
    const [existing] = await db
      .select({ id: membersTable.id, name: membersTable.name })
      .from(membersTable)
      .where(eq(membersTable.email, d.email))
      .limit(1);
    if (existing) {
      res.status(409).json({
        error: "A member with this email already exists",
        code: "DUPLICATE_EMAIL",
        existingMemberId: existing.id,
        existingMemberName: existing.name,
      });
      return;
    }
  }

  const [member] = await db
    .insert(membersTable)
    .values({
      name: d.name,
      employeeId: d.employeeId ?? null,
      department: d.department ?? null,
      classification: d.classification ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      joinDate: d.joinDate as string | null ?? null,
      isActive: d.isActive ?? true,
      notes: d.notes ?? null,
      seniorityDate: (body.seniorityDate as string) ?? null,
      duesStatus: (body.duesStatus as string) ?? "current",
      duesLastPaid: (body.duesLastPaid as string) ?? null,
      shift: (body.shift as string) ?? null,
      classificationDate: (body.classificationDate as string) ?? null,
    })
    .returning();

  await logAudit(req, "create", "member", member.id, null, formatMember(member));
  res.status(201).json(formatMember(member));
}));

router.get("/:id/grievances", asyncHandler(async (req, res) => {
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
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const parsed = GetMemberParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  let member;
  try {
    const [row] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, parsed.data.id));
    member = row;
  } catch (err) {
    console.error(`[members] GET /${parsed.data.id} db error:`, err);
    res.status(500).json({ error: "Failed to fetch member" });
    return;
  }

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  res.json(formatMember(member));
}));

router.patch("/:id", requirePermission("members.edit"), asyncHandler(async (req, res) => {
  const paramParsed = UpdateMemberParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const bodyParsed = PatchMemberBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(422).json({ error: "Invalid request body", code: "VALIDATION_ERROR", details: bodyParsed.error.issues });
    return;
  }

  const d = bodyParsed.data;

  // Strip privileged fields when the caller only has member-level role
  const callerRole = req.session?.role ?? "member";
  const isPrivileged = callerRole === "admin" || callerRole === "chair" || callerRole === "steward";
  if (!isPrivileged) {
    for (const field of PRIVILEGED_FIELDS) {
      delete d[field];
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name !== undefined)               updates.name = d.name;
  if (d.employeeId !== undefined)         updates.employeeId = d.employeeId;
  if (d.department !== undefined)         updates.department = d.department;
  if (d.classification !== undefined)     updates.classification = d.classification;
  if (d.phone !== undefined)              updates.phone = d.phone;
  if (d.email !== undefined)              updates.email = d.email;
  if (d.joinDate !== undefined)           updates.joinDate = d.joinDate;
  if (d.shift !== undefined)              updates.shift = d.shift;
  if (d.classificationDate !== undefined) updates.classificationDate = d.classificationDate;
  if (d.smsEnabled !== undefined)         updates.smsEnabled = d.smsEnabled;
  if (d.emailEnabled !== undefined)       updates.emailEnabled = d.emailEnabled;
  if (d.pushEnabled !== undefined)        updates.pushEnabled = d.pushEnabled;
  // Privileged (only present when caller is admin/steward/chair)
  if (d.isActive !== undefined)           updates.isActive = d.isActive;
  if (d.notes !== undefined)              updates.notes = d.notes;
  if (d.duesStatus !== undefined)         updates.duesStatus = d.duesStatus;
  if (d.duesLastPaid !== undefined)       updates.duesLastPaid = d.duesLastPaid;
  if (d.seniorityDate !== undefined)      updates.seniorityDate = d.seniorityDate;
  if (d.seniorityRank !== undefined)      updates.seniorityRank = d.seniorityRank;
  if (d.accommodationActive !== undefined) updates.accommodationActive = d.accommodationActive;
  if (d.stewardNotes !== undefined)       updates.stewardNotes = d.stewardNotes;

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, paramParsed.data.id));

  const [member] = await db
    .update(membersTable)
    .set(updates)
    .where(eq(membersTable.id, paramParsed.data.id))
    .returning();

  if (!member) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (existing) {
    await logAudit(req, "update", "member", member.id, formatMember(existing), formatMember(member));
  }
  res.json(formatMember(member));
}));

router.delete("/:id", requirePermission("members.edit"), asyncHandler(async (req, res) => {
  const parsed = DeleteMemberParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, parsed.data.id));
  if (existing) {
    await logAudit(req, "delete", "member", existing.id, formatMember(existing), null);
  }
  // Also deactivate any linked user
  const [linkedUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.linkedMemberId, parsed.data.id))
    .limit(1);
  if (linkedUser) {
    await db.update(usersTable).set({ isActive: false }).where(eq(usersTable.id, linkedUser.id));
  }
  await db.delete(membersTable).where(eq(membersTable.id, parsed.data.id));
  res.status(204).end();
}));

// ─── Deactivate member ────────────────────────────────────────────────────────
router.patch("/:id/deactivate", requirePermission("members.edit"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!existing.isActive) { res.status(400).json({ error: "Member is already inactive" }); return; }

  const [updated] = await db
    .update(membersTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(membersTable.id, id))
    .returning();

  // Also deactivate linked user
  const [linkedUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.linkedMemberId, id))
    .limit(1);
  if (linkedUser?.isActive) {
    await db.update(usersTable).set({ isActive: false }).where(eq(usersTable.id, linkedUser.id));
    if (linkedUser.username && existing.email) {
      sendMemberDeactivatedEmail({ recipientEmail: existing.email, recipientName: existing.name }).catch(() => {});
    }
  }

  await logAudit(req, "update", "member", id, { isActive: true }, { isActive: false });
  res.json(formatMember(updated));
}));

// ─── Reactivate member ────────────────────────────────────────────────────────
router.patch("/:id/reactivate", requirePermission("members.edit"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.isActive) { res.status(400).json({ error: "Member is already active" }); return; }

  const [updated] = await db
    .update(membersTable)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(membersTable.id, id))
    .returning();

  // Also reactivate linked user
  const [linkedUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.linkedMemberId, id))
    .limit(1);
  if (linkedUser) {
    await db.update(usersTable).set({ isActive: true }).where(eq(usersTable.id, linkedUser.id));
  }

  await logAudit(req, "update", "member", id, { isActive: false }, { isActive: true });
  res.json(formatMember(updated));
}));

function formatMember(m: typeof membersTable.$inferSelect, includePrivileged = true) {
  const base = {
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
    seniorityDate: m.seniorityDate ?? null,
    duesStatus: m.duesStatus ?? "current",
    duesLastPaid: m.duesLastPaid ?? null,
    shift: m.shift ?? null,
    classificationDate: m.classificationDate ?? null,
    smsEnabled: m.smsEnabled ?? false,
    emailEnabled: m.emailEnabled ?? true,
    pushEnabled: m.pushEnabled ?? true,
    cardSigned: !!m.signedAt,
    signedAt: m.signedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
  if (!includePrivileged) return base;
  return {
    ...base,
    seniorityRank: m.seniorityRank ?? null,
    accommodationActive: m.accommodationActive ?? false,
    stewardNotes: m.stewardNotes ?? null,
    engagementLevel: m.engagementLevel ?? "unknown",
    shopFloorLeader: m.shopFloorLeader ?? false,
    organizingNotes: m.organizingNotes ?? null,
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

// ─── Member Files ──────────────────────────────────────────────────────────

router.get("/:id/files", asyncHandler(async (req, res) => {
  const memberId = parseInt(req.params.id as string, 10);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [member] = await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, memberId));
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }

  const files = await db
    .select()
    .from(memberFilesTable)
    .where(eq(memberFilesTable.memberId, memberId))
    .orderBy(desc(memberFilesTable.uploadedAt));

  res.json(files.map((f) => ({
    id: f.id,
    memberId: f.memberId,
    category: f.category,
    filename: f.filename,
    objectPath: f.objectPath,
    contentType: f.contentType,
    fileSize: f.fileSize,
    description: f.description ?? null,
    uploadedAt: f.uploadedAt.toISOString(),
  })));
}));

router.post(
  "/:id/files",
  requirePermission("members.edit"),
  upload.single("file"),
  async (req, res) => {
    const memberId = parseInt(req.params.id as string, 10);
    if (isNaN(memberId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }

    const [member] = await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, memberId));
    if (!member) { res.status(404).json({ error: "Member not found" }); return; }

    const category = (req.body.category as string) || "general";
    const description = (req.body.description as string) || null;

    try {
      const { objectPath } = await storageUpload(
        req.file.buffer,
        req.file.mimetype || "application/octet-stream",
      );

      const [saved] = await db
        .insert(memberFilesTable)
        .values({
          memberId,
          category,
          filename: req.file.originalname,
          objectPath,
          contentType: req.file.mimetype || "application/octet-stream",
          fileSize: req.file.size,
          description,
        })
        .returning();

      res.status(201).json({
        id: saved.id,
        memberId: saved.memberId,
        category: saved.category,
        filename: saved.filename,
        objectPath: saved.objectPath,
        contentType: saved.contentType,
        fileSize: saved.fileSize,
        description: saved.description ?? null,
        uploadedAt: saved.uploadedAt.toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to upload member file");
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

router.delete("/:id/files/:fileId", requirePermission("members.edit"), asyncHandler(async (req, res) => {
  const memberId = parseInt(req.params.id as string, 10);
  const fileId = parseInt(req.params.fileId as string, 10);
  if (isNaN(memberId) || isNaN(fileId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [file] = await db
    .select()
    .from(memberFilesTable)
    .where(and(eq(memberFilesTable.id, fileId), eq(memberFilesTable.memberId, memberId)));
  if (!file) { res.status(404).json({ error: "File not found" }); return; }

  await db.delete(memberFilesTable).where(eq(memberFilesTable.id, fileId));
  res.status(204).end();
}));

export default router;
