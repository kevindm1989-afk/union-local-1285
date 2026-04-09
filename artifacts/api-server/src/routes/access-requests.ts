import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import { db, accessRequestsTable, membersTable, usersTable } from "@workspace/db";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import {
  sendNewMemberRequestNotification,
  sendAccessRequestApprovedEmail,
  sendAccessRequestRejectedEmail,
} from "../lib/email";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

function isAdmin(req: Request): boolean {
  return ["admin", "chair"].includes(req.session?.role ?? "");
}

function requireAdmin(req: Request, res: Response): boolean {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Admin access required", code: "FORBIDDEN" });
    return false;
  }
  return true;
}

// ─── Rate limiter for public POST ─────────────────────────────────────────────
export const accessRequestRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in an hour.", code: "RATE_LIMITED" },
});

// ─── Validation ───────────────────────────────────────────────────────────────
const ROLE_ENUM = ["member", "steward", "co_chair"] as const;
type RequestedRole = typeof ROLE_ENUM[number];

const CreateRequestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.email().max(255),
  phone: z.string().max(30).optional(),
  employeeId: z.string().max(50).optional(),
  department: z.string().max(100).optional(),
  shift: z.enum(["days", "afternoons", "nights", "rotating"]).optional(),
  requestedRole: z.enum(ROLE_ENUM).default("member"),
  roleJustification: z.string().max(2000).optional(),
  message: z.string().max(1000).optional(),
}).refine(
  (d) => {
    if (d.requestedRole === "steward" || d.requestedRole === "co_chair") {
      return !!d.roleJustification?.trim();
    }
    return true;
  },
  { message: "Role justification is required for steward and co-chair requests", path: ["roleJustification"] }
);

// ─── POST /api/access-requests — public, rate-limited ────────────────────────
router.post("/", accessRequestRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const parsed = CreateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid request data", code: "VALIDATION_ERROR", details: parsed.error.issues });
    return;
  }
  const d = parsed.data;

  // Duplicate check: email in members
  const [existingMember] = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(ilike(membersTable.email, d.email))
    .limit(1);

  if (existingMember) {
    res.status(409).json({ error: "An account with this email or employee ID already exists or is pending review.", code: "DUPLICATE" });
    return;
  }

  // Duplicate check: email in pending access_requests
  const emailConflict = await db
    .select({ id: accessRequestsTable.id })
    .from(accessRequestsTable)
    .where(
      and(
        eq(accessRequestsTable.status, "pending"),
        sql`lower(${accessRequestsTable.email}) = lower(${d.email})`
      )
    )
    .limit(1);

  if (emailConflict.length > 0) {
    res.status(409).json({ error: "An account with this email or employee ID already exists or is pending review.", code: "DUPLICATE" });
    return;
  }

  // Duplicate check: employeeId in members and pending requests
  if (d.employeeId) {
    const [empMember] = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(ilike(membersTable.employeeId, d.employeeId))
      .limit(1);

    if (empMember) {
      res.status(409).json({ error: "An account with this email or employee ID already exists or is pending review.", code: "DUPLICATE" });
      return;
    }

    const empConflict = await db
      .select({ id: accessRequestsTable.id })
      .from(accessRequestsTable)
      .where(
        and(
          eq(accessRequestsTable.status, "pending"),
          sql`lower(${accessRequestsTable.employeeId}) = lower(${d.employeeId})`
        )
      )
      .limit(1);

    if (empConflict.length > 0) {
      res.status(409).json({ error: "An account with this email or employee ID already exists or is pending review.", code: "DUPLICATE" });
      return;
    }
  }

  const fullName = `${d.firstName} ${d.lastName}`;
  const username = `${d.firstName.toLowerCase().replace(/[^a-z0-9]/g, "")}.${d.lastName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  const [request] = await db
    .insert(accessRequestsTable)
    .values({
      name: fullName,
      username,
      reason: d.message ?? null,
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone ?? null,
      employeeId: d.employeeId ?? null,
      department: d.department ?? null,
      shift: d.shift ?? null,
      requestedRole: d.requestedRole,
      roleJustification: d.roleJustification ?? null,
      message: d.message ?? null,
    })
    .returning();

  res.status(201).json({ ok: true, id: request.id });

  // Fire-and-forget admin notification
  sendNewMemberRequestNotification({
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    employeeId: d.employeeId ?? null,
    department: d.department ?? null,
    requestedRole: d.requestedRole,
  }).catch(() => {});
}));

// ─── GET /api/access-requests — admin only ────────────────────────────────────
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const role = typeof req.query.role === "string" ? req.query.role : undefined;

  const conditions = [];
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    conditions.push(eq(accessRequestsTable.status, status));
  }
  if (role && ["member", "steward", "co_chair"].includes(role)) {
    conditions.push(eq(accessRequestsTable.requestedRole, role));
  }

  const requests = await db
    .select()
    .from(accessRequestsTable)
    .where(conditions.length ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined)
    .orderBy(
      // Pending first
      sql`CASE WHEN ${accessRequestsTable.status} = 'pending' THEN 0 ELSE 1 END`,
      // Steward/co_chair requests at top of pending queue
      sql`CASE WHEN ${accessRequestsTable.status} = 'pending' AND ${accessRequestsTable.requestedRole} IN ('steward', 'co_chair') THEN 0 ELSE 1 END`,
      desc(accessRequestsTable.createdAt)
    );

  // Join reviewer name if available
  const userIds = [...new Set(requests.map((r) => r.reviewedBy).filter(Boolean) as number[])];
  let userMap: Record<number, string> = {};
  if (userIds.length) {
    const users = await db
      .select({ id: usersTable.id, displayName: usersTable.displayName })
      .from(usersTable)
      .where(sql`id = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}])`);
    for (const u of users) userMap[u.id] = u.displayName;
  }

  res.json(requests.map((r) => ({
    ...r,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    reviewerName: r.reviewedBy ? userMap[r.reviewedBy] ?? null : null,
  })));
}));

// ─── GET /api/access-requests/:id — admin only ───────────────────────────────
router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID", code: "INVALID_ID" }); return; }

  const [request] = await db.select().from(accessRequestsTable).where(eq(accessRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }

  res.json({ ...request, reviewedAt: request.reviewedAt?.toISOString() ?? null, createdAt: request.createdAt.toISOString() });
}));

// ─── PATCH /api/access-requests/:id/approve — admin only ─────────────────────
router.patch("/:id/approve", asyncHandler(async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID", code: "INVALID_ID" }); return; }

  // approvedRole can be specified; defaults to requestedRole or "member"
  const APPROVED_ROLES = ["member", "steward", "co_chair", "admin"] as const;
  const bodyRole = req.body?.approvedRole;
  if (bodyRole && !APPROVED_ROLES.includes(bodyRole)) {
    res.status(400).json({ error: "Invalid approvedRole", code: "VALIDATION_ERROR" });
    return;
  }

  const [request] = await db.select().from(accessRequestsTable).where(eq(accessRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  if (request.status !== "pending") { res.status(400).json({ error: "Request is not pending", code: "INVALID_STATUS" }); return; }

  const approvedRole: string = bodyRole ?? request.requestedRole ?? "member";
  const requestedRole: string = request.requestedRole ?? "member";
  const roleDiffers = approvedRole !== requestedRole;

  // Generate temp password
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const tempPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const firstName = request.firstName ?? request.name.split(" ")[0];
  const lastName = request.lastName ?? request.name.split(" ").slice(1).join(" ");
  const displayName = request.firstName && request.lastName ? `${request.firstName} ${request.lastName}` : request.name;

  // Create member record
  const [newMember] = await db
    .insert(membersTable)
    .values({
      name: displayName,
      employeeId: request.employeeId ?? null,
      department: request.department ?? null,
      phone: request.phone ?? null,
      email: request.email ?? null,
      shift: request.shift ?? null,
      isActive: true,
    })
    .returning();

  // Create user account with the approved role
  let newUser;
  try {
    [newUser] = await db
      .insert(usersTable)
      .values({
        username: request.username,
        displayName,
        passwordHash,
        role: approvedRole,
        isActive: true,
        linkedMemberId: newMember.id,
      })
      .returning({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName });
  } catch (err: unknown) {
    // Rollback member if user creation fails
    await db.delete(membersTable).where(eq(membersTable.id, newMember.id));
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "A user with that username already exists", code: "USERNAME_CONFLICT" });
    } else {
      res.status(500).json({ error: "Internal server error", code: "SERVER_ERROR" });
    }
    return;
  }

  // Update request status
  await db
    .update(accessRequestsTable)
    .set({ status: "approved", approvedRole, reviewedBy: req.session.userId, reviewedAt: new Date() })
    .where(eq(accessRequestsTable.id, id));

  // Log to audit_log — flag if role was changed
  await logAudit(req, "create", "member", newMember.id, null, {
    name: displayName,
    fromRequest: id,
    requestedRole,
    approvedRole,
    roleDiffers,
  });

  res.json({ ok: true, user: newUser, memberId: newMember.id, tempPassword, approvedRole, roleDiffers });

  // Fire-and-forget email
  if (request.email) {
    sendAccessRequestApprovedEmail({
      recipientEmail: request.email,
      recipientName: displayName,
      username: request.username,
      tempPassword,
      approvedRole,
      requestedRole,
    }).catch(() => {});
  }
}));

// ─── PATCH /api/access-requests/:id/reject — admin only ──────────────────────
router.patch("/:id/reject", asyncHandler(async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID", code: "INVALID_ID" }); return; }

  const { rejectionReason } = req.body ?? {};
  if (!rejectionReason || typeof rejectionReason !== "string" || !rejectionReason.trim()) {
    res.status(400).json({ error: "rejectionReason is required", code: "VALIDATION_ERROR" });
    return;
  }

  const [request] = await db.select().from(accessRequestsTable).where(eq(accessRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  if (request.status !== "pending") { res.status(400).json({ error: "Request is not pending", code: "INVALID_STATUS" }); return; }

  await db
    .update(accessRequestsTable)
    .set({ status: "rejected", rejectionReason: rejectionReason.trim(), reviewedBy: req.session.userId, reviewedAt: new Date() })
    .where(eq(accessRequestsTable.id, id));

  res.json({ ok: true });

  // Fire-and-forget email
  if (request.email) {
    sendAccessRequestRejectedEmail({
      recipientEmail: request.email,
      recipientName: request.firstName && request.lastName ? `${request.firstName} ${request.lastName}` : request.name,
      rejectionReason: rejectionReason.trim(),
    }).catch(() => {});
  }
}));

// ─── DELETE /api/access-requests/:id — admin only, pending only ───────────────
router.delete("/:id", asyncHandler(async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID", code: "INVALID_ID" }); return; }

  const [request] = await db.select().from(accessRequestsTable).where(eq(accessRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  if (request.status !== "pending") { res.status(400).json({ error: "Only pending requests can be deleted", code: "INVALID_STATUS" }); return; }

  await db.delete(accessRequestsTable).where(eq(accessRequestsTable.id, id));
  res.status(204).end();
}));

export default router;
