import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, accessRequestsTable, rolePermissionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ALL_PERMISSIONS, loadUserPermissions } from "../lib/seedAdmin";
import { sendAccessRequestNotification } from "../lib/email";
import { asyncHandler } from "../lib/asyncHandler";

const router: IRouter = Router();

function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one digit.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include at least one special character.";
  return null;
}

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
    displayName: string;
    role: string;
    permissions: string[];
    linkedMemberId?: number;
  }
}

/**
 * POST /auth/login
 */
router.post("/auth/login", async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, String(username).toLowerCase().trim()))
      .limit(1);

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const permissions = await loadUserPermissions(user.role);

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.displayName = user.displayName;
    req.session.role = user.role;
    req.session.permissions = permissions;
    req.session.linkedMemberId = user.linkedMemberId ?? undefined;

    // Track last login time (fire-and-forget)
    db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id)).catch(() => {});

    req.session.save((err) => {
      if (err) {
        req.log.error({ err }, "Session save failed");
        res.status(500).json({ error: "Failed to create session" });
        return;
      }
      res.json({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        permissions,
        linkedMemberId: user.linkedMemberId ?? null,
      });
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /auth/logout
 */
router.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie("union.sid");
    res.json({ ok: true });
  });
});

/**
 * GET /auth/me — returns current session user or 401
 */
router.get("/auth/me", (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({
    id: req.session.userId,
    username: req.session.username,
    displayName: req.session.displayName,
    role: req.session.role,
    permissions: req.session.permissions ?? [],
    linkedMemberId: req.session.linkedMemberId ?? null,
  });
});

/**
 * POST /auth/request-access
 */
router.post("/auth/request-access", async (req: Request, res: Response) => {
  const { name, username, reason } = req.body ?? {};

  if (!name || !username) {
    res.status(400).json({ error: "Name and username are required" });
    return;
  }

  try {
    const existing = await db
      .select({ id: accessRequestsTable.id })
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.username, String(username).toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "A request for that username already exists" });
      return;
    }

    const [request] = await db
      .insert(accessRequestsTable)
      .values({
        name: String(name).trim(),
        username: String(username).toLowerCase().trim(),
        reason: reason ? String(reason).trim() : null,
      })
      .returning();

    res.status(201).json(request);

    // Fire-and-forget — don't let email failure affect the response
    sendAccessRequestNotification({
      requesterName: request.name,
      requesterUsername: request.username,
      reason: request.reason,
    });
  } catch (err) {
    req.log.error({ err }, "Access request error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /auth/access-requests — admin only: list pending requests
 */
router.get("/auth/access-requests", asyncHandler(async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const requests = await db
    .select()
    .from(accessRequestsTable)
    .orderBy(accessRequestsTable.createdAt);
  res.json(requests);
}));

/**
 * POST /auth/access-requests/:id/approve — admin only: approve and create user account
 */
router.post("/auth/access-requests/:id/approve", async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const id = Number(req.params.id);
  try {
    const [request] = await db
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.id, id))
      .limit(1);
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const tempPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const [newUser] = await db
      .insert(usersTable)
      .values({
        username: request.username,
        displayName: request.name,
        passwordHash,
        role: "steward",
        isActive: true,
      })
      .returning({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName });

    await db.delete(accessRequestsTable).where(eq(accessRequestsTable.id, id));

    res.json({ user: newUser, tempPassword });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A user with that username already exists" });
    } else {
      req.log.error({ err }, "Approve request error");
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

/**
 * DELETE /auth/access-requests/:id — admin only: deny/remove a request
 */
router.delete("/auth/access-requests/:id", asyncHandler(async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const id = Number(req.params.id);
  await db.delete(accessRequestsTable).where(eq(accessRequestsTable.id, id));
  res.json({ ok: true });
}));

/**
 * GET /auth/users — admin only: list all users
 */
router.get("/auth/users", asyncHandler(async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const memberIdFilter = req.query.memberId ? parseInt(req.query.memberId as string, 10) : null;
  const query = db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      role: usersTable.role,
      isActive: usersTable.isActive,
      linkedMemberId: usersTable.linkedMemberId,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable);
  const users = memberIdFilter && !isNaN(memberIdFilter)
    ? await query.where(eq(usersTable.linkedMemberId, memberIdFilter))
    : await query.orderBy(usersTable.createdAt);
  res.json(users);
}));

/**
 * POST /auth/users — admin only: create a new user manually
 */
router.post("/auth/users", async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const { username, displayName, role, password } = req.body ?? {};
  if (!username || !displayName || !password) {
    res.status(400).json({ error: "username, displayName, and password are required" });
    return;
  }
  const strengthError = validatePasswordStrength(String(password));
  if (strengthError) {
    res.status(400).json({ error: strengthError });
    return;
  }
  try {
    const passwordHash = await bcrypt.hash(String(password), 12);
    const [newUser] = await db
      .insert(usersTable)
      .values({
        username: String(username).toLowerCase().trim(),
        displayName: String(displayName).trim(),
        passwordHash,
        role: (["admin", "chair", "steward", "member"] as string[]).includes(role) ? role : "steward",
        isActive: true,
      })
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
      });
    res.status(201).json(newUser);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Username already exists" });
    } else {
      req.log.error({ err }, "Create user error");
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

/**
 * PATCH /auth/users/:id — admin only: update user (toggle active, change role, reset password)
 */
router.patch("/auth/users/:id", asyncHandler(async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const id = Number(req.params.id);
  const { isActive, role, password, displayName, linkedMemberId } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (typeof isActive === "boolean") updates.isActive = isActive;
  if ((["admin", "chair", "steward", "member"] as string[]).includes(role)) updates.role = role;
  if (linkedMemberId !== undefined) updates.linkedMemberId = linkedMemberId === null ? null : Number(linkedMemberId);
  if (displayName) updates.displayName = String(displayName).trim();
  if (password) {
    const strengthError = validatePasswordStrength(String(password));
    if (strengthError) {
      res.status(400).json({ error: strengthError });
      return;
    }
    updates.passwordHash = await bcrypt.hash(String(password), 12);
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      role: usersTable.role,
      isActive: usersTable.isActive,
    });
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(updated);
}));

/**
 * PATCH /auth/users/:id/role — admin only: change a user's role
 */
router.patch("/auth/users/:id/role", asyncHandler(async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const userId = parseInt(req.params.id as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const { role } = req.body ?? {};
  const VALID_ROLES = ["admin", "chair", "steward", "member"];
  if (!role || !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: "role must be one of: admin, chair, steward, member" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ role })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName, role: usersTable.role });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
}));

/**
 * GET /auth/roles/permissions — chair/admin only: get permissions for all configurable roles
 */
router.get("/auth/roles/permissions", asyncHandler(async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const rows = await db.select().from(rolePermissionsTable);
  const result: Record<string, Record<string, boolean>> = {};
  for (const row of rows) {
    if (!result[row.role]) result[row.role] = {};
    result[row.role][row.permission] = row.granted;
  }
  res.json({ allPermissions: ALL_PERMISSIONS, rolePermissions: result });
}));

/**
 * DELETE /auth/users/:id — admin/chair only: permanently remove a user account
 */
router.delete("/auth/users/:id", asyncHandler(async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  if (id === req.session.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  const [target] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.role === "admin") {
    res.status(400).json({ error: "Cannot delete an admin account" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ ok: true });
}));

/**
 * PATCH /auth/roles/permissions — chair/admin only: update a single permission for a role
 */
router.patch("/auth/roles/permissions", asyncHandler(async (req: Request, res: Response) => {
  if (!["admin", "chair"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const { role, permission, granted } = req.body ?? {};
  if (!role || !permission || typeof granted !== "boolean") {
    res.status(400).json({ error: "role, permission, and granted (boolean) are required" });
    return;
  }
  if (!["chair", "steward", "member"].includes(role)) {
    res.status(400).json({ error: "Can only modify chair, steward, or member permissions" });
    return;
  }
  if (!(ALL_PERMISSIONS as readonly string[]).includes(permission)) {
    res.status(400).json({ error: "Unknown permission" });
    return;
  }
  await db
    .insert(rolePermissionsTable)
    .values({ role, permission, granted })
    .onConflictDoUpdate({
      target: [rolePermissionsTable.role, rolePermissionsTable.permission],
      set: { granted },
    });
  res.json({ ok: true });
}));

export default router;
