import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, accessRequestsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
    displayName: string;
    role: string;
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

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.displayName = user.displayName;
    req.session.role = user.role;

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
  } catch (err) {
    req.log.error({ err }, "Access request error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /auth/access-requests — admin only: list pending requests
 */
router.get("/auth/access-requests", async (req: Request, res: Response) => {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const requests = await db
    .select()
    .from(accessRequestsTable)
    .orderBy(accessRequestsTable.createdAt);
  res.json(requests);
});

export default router;
